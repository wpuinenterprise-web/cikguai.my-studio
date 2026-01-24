import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Check, X, Trash2, Edit2, Save, Users, Video, Shield, RefreshCw, UserCheck, Clock, Link, Award, Eye, DollarSign, Zap, Calendar, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UserData {
  id: string;
  email: string | null;
  username: string | null;
  phone_number: string | null;
  is_approved: boolean;
  videos_used: number;
  images_used: number;
  video_limit: number;
  image_limit: number;
  // Per-model limits
  sora2_limit: number;
  sora2pro_limit: number;
  veo3_limit: number;
  sora2_used: number;
  sora2pro_used: number;
  veo3_used: number;
  total_videos_generated: number;
  referral_code: string | null;
  referred_by: string | null;
  created_at: string;
  // Workflow subscription fields
  workflow_access_approved: boolean;
  workflow_subscription_ends_at: string | null;
  workflow_subscription_days: number;
}

interface AffiliateData {
  userId: string;
  username: string | null;
  email: string | null;
  referralCode: string | null;
  referralCount: number;
  referrals: UserData[];
  joinedAt: string;
}

type TabType = 'users' | 'affiliate' | 'workflow';

const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editLimits, setEditLimits] = useState({
    video_limit: 0,
    image_limit: 0,
    sora2_limit: 0,
    sora2pro_limit: 0,
    veo3_limit: 0,
  });
  const [resetVideos, setResetVideos] = useState(false);
  const [resetImages, setResetImages] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: UserData | null }>({
    open: false,
    user: null,
  });
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [selectedAffiliate, setSelectedAffiliate] = useState<AffiliateData | null>(null);
  const [commissionPerReferral, setCommissionPerReferral] = useState(30); // RM per referral

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Map data with default values for new fields (for existing users without these columns)
      const mappedData = (data || []).map((user: any) => ({
        ...user,
        sora2_limit: user.sora2_limit ?? 0,
        sora2pro_limit: user.sora2pro_limit ?? 0,
        veo3_limit: user.veo3_limit ?? 0,
        sora2_used: user.sora2_used ?? 0,
        sora2pro_used: user.sora2pro_used ?? 0,
        veo3_used: user.veo3_used ?? 0,
      })) as UserData[];
      setUsers(mappedData);
    } catch (error: any) {
      toast.error('Gagal memuatkan senarai pengguna');
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Calculate affiliate data from users
  const affiliateData = useMemo<AffiliateData[]>(() => {
    const affiliateMap = new Map<string, AffiliateData>();

    // First, create entries for all users with referral codes
    users.forEach(user => {
      if (user.referral_code) {
        affiliateMap.set(user.id, {
          userId: user.id,
          username: user.username,
          email: user.email,
          referralCode: user.referral_code,
          referralCount: 0,
          referrals: [],
          joinedAt: user.created_at,
        });
      }
    });

    // Then, count referrals for each affiliate
    users.forEach(user => {
      if (user.referred_by && affiliateMap.has(user.referred_by)) {
        const affiliate = affiliateMap.get(user.referred_by)!;
        affiliate.referralCount++;
        affiliate.referrals.push(user);
      }
    });

    // Sort by referral count (highest first)
    return Array.from(affiliateMap.values())
      .filter(a => a.referralCount > 0 || a.referralCode)
      .sort((a, b) => b.referralCount - a.referralCount);
  }, [users]);

  // Filter affiliates with actual referrals
  const activeAffiliates = affiliateData.filter(a => a.referralCount > 0);

  const handleApprove = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: true })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Pengguna telah diluluskan');
      fetchUsers();
    } catch (error: any) {
      toast.error('Gagal meluluskan pengguna');
    }
  };

  const handleReject = async (user: UserData) => {
    setDeleteDialog({ open: true, user });
  };

  const confirmReject = async () => {
    if (!deleteDialog.user) return;

    try {
      const response = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: deleteDialog.user.id },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Gagal memadam pengguna');
      }

      toast.success('Pengguna telah dipadam sepenuhnya');
      setDeleteDialog({ open: false, user: null });
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Gagal memadam pengguna');
      console.error('Error deleting user:', error);
    }
  };

  const handleEditLimits = (user: UserData) => {
    setEditingUser(user.id);
    setEditLimits({
      video_limit: user.video_limit,
      image_limit: user.image_limit,
      sora2_limit: user.sora2_limit,
      sora2pro_limit: user.sora2pro_limit,
      veo3_limit: user.veo3_limit,
    });
    setResetVideos(false);
    setResetImages(false);
  };

  const handleSaveLimits = async (userId: string) => {
    try {
      const updateData: {
        video_limit: number;
        image_limit: number;
        sora2_limit: number;
        sora2pro_limit: number;
        veo3_limit: number;
        videos_used?: number;
        images_used?: number;
        sora2_used?: number;
        sora2pro_used?: number;
        veo3_used?: number;
      } = {
        video_limit: editLimits.video_limit,
        image_limit: editLimits.image_limit,
        sora2_limit: editLimits.sora2_limit,
        sora2pro_limit: editLimits.sora2pro_limit,
        veo3_limit: editLimits.veo3_limit,
      };

      // If reset checkbox is checked, reset all usage counters to 0
      if (resetVideos) {
        updateData.videos_used = 0;
        updateData.sora2_used = 0;
        updateData.sora2pro_used = 0;
        updateData.veo3_used = 0;
      }

      // If reset images checkbox is checked, reset images_used to 0
      if (resetImages) {
        updateData.images_used = 0;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      const resetMsg = [];
      if (resetVideos) resetMsg.push('video');
      if (resetImages) resetMsg.push('imej');

      toast.success(resetMsg.length > 0
        ? `Had dikemaskini dan ${resetMsg.join(' & ')} dijana direset`
        : 'Had pengguna telah dikemaskini');
      setEditingUser(null);
      setResetVideos(false);
      setResetImages(false);
      fetchUsers();
    } catch (error: any) {
      toast.error('Gagal mengemaskini had');
    }
  };

  // Workflow Subscription Management
  const [editingWorkflowUser, setEditingWorkflowUser] = useState<string | null>(null);
  const [editWorkflowDays, setEditWorkflowDays] = useState(30);

  const handleApproveWorkflow = async (userId: string, days: number = 30) => {
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      const { error } = await supabase
        .from('profiles')
        .update({
          workflow_access_approved: true,
          workflow_subscription_ends_at: expiryDate.toISOString(),
          workflow_subscription_days: days,
        })
        .eq('id', userId);

      if (error) throw error;

      toast.success(`Akses workflow diluluskan untuk ${days} hari`);
      setEditingWorkflowUser(null);
      fetchUsers();
    } catch (error: any) {
      toast.error('Gagal meluluskan akses workflow');
      console.error('Error approving workflow:', error);
    }
  };

  const handleRevokeWorkflow = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          workflow_access_approved: false,
          workflow_subscription_ends_at: null,
        })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Akses workflow telah ditarik balik');
      fetchUsers();
    } catch (error: any) {
      toast.error('Gagal tarik balik akses');
      console.error('Error revoking workflow:', error);
    }
  };

  const handleExtendWorkflow = async (userId: string, extraDays: number) => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;

      let newExpiry: Date;
      if (user.workflow_subscription_ends_at && new Date(user.workflow_subscription_ends_at) > new Date()) {
        // Extend from current expiry
        newExpiry = new Date(user.workflow_subscription_ends_at);
      } else {
        // Start from now
        newExpiry = new Date();
      }
      newExpiry.setDate(newExpiry.getDate() + extraDays);

      const { error } = await supabase
        .from('profiles')
        .update({
          workflow_access_approved: true,
          workflow_subscription_ends_at: newExpiry.toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      toast.success(`Subscription dilanjutkan ${extraDays} hari`);
      setEditingWorkflowUser(null);
      fetchUsers();
    } catch (error: any) {
      toast.error('Gagal melanjutkan subscription');
      console.error('Error extending workflow:', error);
    }
  };

  const getWorkflowStatus = (user: UserData): { status: 'active' | 'expired' | 'pending'; daysLeft: number } => {
    if (!user.workflow_access_approved) {
      return { status: 'pending', daysLeft: 0 };
    }
    if (!user.workflow_subscription_ends_at) {
      return { status: 'pending', daysLeft: 0 };
    }
    const now = new Date();
    const expiry = new Date(user.workflow_subscription_ends_at);
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      return { status: 'expired', daysLeft: 0 };
    }
    return { status: 'active', daysLeft };
  };

  // Workflow subscription stats
  const workflowStats = {
    approved: users.filter(u => u.workflow_access_approved).length,
    active: users.filter(u => {
      const status = getWorkflowStatus(u);
      return status.status === 'active';
    }).length,
    expired: users.filter(u => {
      const status = getWorkflowStatus(u);
      return status.status === 'expired';
    }).length,
    pending: users.filter(u => !u.workflow_access_approved).length,
  };

  const filteredUsers = users.filter(user =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAffiliates = affiliateData.filter(affiliate =>
    affiliate.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    affiliate.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    affiliate.referralCode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: users.length,
    approved: users.filter(u => u.is_approved).length,
    pending: users.filter(u => !u.is_approved).length,
    totalVideos: users.reduce((acc, u) => acc + u.videos_used, 0),
    totalReferrals: users.filter(u => u.referred_by).length,
  };

  const affiliateStats = {
    totalAffiliates: affiliateData.length,
    activeAffiliates: activeAffiliates.length,
    totalReferrals: activeAffiliates.reduce((acc, a) => acc + a.referralCount, 0),
    topAffiliate: activeAffiliates[0] || null,
    estimatedCommission: activeAffiliates.reduce((acc, a) => acc + a.referralCount * commissionPerReferral, 0),
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ms-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="flex flex-col h-full bg-background p-4 md:p-6 lg:p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <header className="mb-6 md:mb-8 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-display font-bold text-foreground tracking-tight mb-1">
                Admin <span className="gradient-text">Dashboard</span>
              </h2>
              <p className="text-muted-foreground text-xs md:text-sm">
                Urus pengguna & monitor affiliate
              </p>
            </div>
            <Button
              onClick={fetchUsers}
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 animate-fade-in" style={{ animationDelay: '50ms' }}>
          <Button
            variant={activeTab === 'users' ? 'default' : 'outline'}
            onClick={() => setActiveTab('users')}
            className="gap-2"
          >
            <Users className="w-4 h-4" />
            Pengguna
          </Button>
          <Button
            variant={activeTab === 'affiliate' ? 'default' : 'outline'}
            onClick={() => setActiveTab('affiliate')}
            className="gap-2"
          >
            <Link className="w-4 h-4" />
            Affiliate
            {affiliateStats.totalReferrals > 0 && (
              <Badge variant="secondary" className="ml-1 bg-green-500/20 text-green-400">
                {affiliateStats.totalReferrals}
              </Badge>
            )}
          </Button>
          <Button
            variant={activeTab === 'workflow' ? 'default' : 'outline'}
            onClick={() => setActiveTab('workflow')}
            className="gap-2"
          >
            <Zap className="w-4 h-4" />
            Workflow Sub
            {workflowStats.active > 0 && (
              <Badge variant="secondary" className="ml-1 bg-primary/20 text-primary">
                {workflowStats.active}
              </Badge>
            )}
          </Button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            {/* Stats Cards - Mobile optimized */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
              <div className="stat-card animate-fade-in" style={{ animationDelay: '50ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-xl">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{stats.total}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Jumlah Pengguna</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '100ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-success/10 rounded-xl">
                    <UserCheck className="w-5 h-5 text-success" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{stats.approved}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Diluluskan</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '150ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-warning/10 rounded-xl">
                    <Clock className="w-5 h-5 text-warning" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{stats.pending}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Menunggu</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-accent/10 rounded-xl">
                    <Video className="w-5 h-5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{stats.totalVideos}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Video Dijana</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '250ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-500/10 rounded-xl">
                    <Link className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{stats.totalReferrals}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Dari Referral</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4 md:mb-6 animate-fade-in" style={{ animationDelay: '250ms' }}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
              <Input
                placeholder="Cari ID, email atau username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 md:pl-12 bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground h-11 md:h-12 rounded-xl"
              />
            </div>

            {/* Users List */}
            <div className="glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '300ms' }}>
              <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-3 p-4 border-b border-border/30 bg-muted/30">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pengguna</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Video</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Had Video</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Imej</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Had Imej</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tindakan</span>
              </div>

              <div className="divide-y divide-border/30">
                {loading ? (
                  <div className="flex items-center justify-center gap-3 py-16">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-muted-foreground">Memuatkan...</span>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    Tiada pengguna dijumpai
                  </div>
                ) : (
                  filteredUsers.map((user, index) => (
                    <div
                      key={user.id}
                      className="p-4 data-table-row animate-fade-in"
                      style={{ animationDelay: `${350 + index * 50}ms` }}
                    >
                      {/* Mobile Layout */}
                      <div className="lg:hidden space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">{user.username || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">{user.id.slice(0, 12)}...</p>
                          </div>
                          {user.is_approved ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20 shrink-0">
                              Diluluskan
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 shrink-0">
                              Menunggu
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs flex-wrap">
                            <div className="flex flex-col">
                              <span className="text-muted-foreground text-[9px] uppercase">Dijana</span>
                              <span className="text-foreground font-bold">{user.videos_used}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-muted-foreground text-[9px] uppercase">Baki</span>
                              <span className={`font-bold ${user.video_limit - user.videos_used <= 0 ? 'text-destructive' : 'text-green-500'}`}>
                                {Math.max(0, user.video_limit - user.videos_used)}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-muted-foreground text-[9px] uppercase">Had</span>
                              {editingUser === user.id ? (
                                <Input
                                  type="number"
                                  value={editLimits.video_limit}
                                  onChange={(e) => setEditLimits({ ...editLimits, video_limit: parseInt(e.target.value) || 0 })}
                                  className="w-14 h-6 text-xs bg-secondary border-border p-1"
                                />
                              ) : (
                                <span className="text-foreground font-bold">{user.video_limit}</span>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-muted-foreground text-[9px] uppercase">Total</span>
                              <span className="text-cyan-400 font-bold">{user.total_videos_generated || 0}</span>
                            </div>
                          </div>
                        </div>

                        {/* Reset checkbox when editing */}
                        {editingUser === user.id && (
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="checkbox"
                              id={`reset-${user.id}`}
                              checked={resetVideos}
                              onChange={(e) => setResetVideos(e.target.checked)}
                              className="w-4 h-4 rounded border-border bg-secondary accent-primary"
                            />
                            <label htmlFor={`reset-${user.id}`} className="text-xs text-muted-foreground">
                              Reset video dijana ke 0
                            </label>
                          </div>
                        )}

                        {/* Image Stats - Mobile */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/30">
                          <div className="flex items-center gap-3 text-xs flex-wrap">
                            <div className="flex flex-col">
                              <span className="text-purple-400 text-[9px] uppercase">Imej Dijana</span>
                              <span className="text-purple-400 font-bold">{user.images_used}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-purple-400 text-[9px] uppercase">Imej Baki</span>
                              <span className={`font-bold ${user.image_limit - user.images_used <= 0 ? 'text-destructive' : 'text-green-500'}`}>
                                {Math.max(0, user.image_limit - user.images_used)}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-purple-400 text-[9px] uppercase">Had Imej</span>
                              {editingUser === user.id ? (
                                <Input
                                  type="number"
                                  value={editLimits.image_limit}
                                  onChange={(e) => setEditLimits({ ...editLimits, image_limit: parseInt(e.target.value) || 0 })}
                                  className="w-14 h-6 text-xs bg-secondary border-purple-500/30 p-1"
                                />
                              ) : (
                                <span className="text-foreground font-bold">{user.image_limit}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Reset images checkbox when editing */}
                        {editingUser === user.id && (
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="checkbox"
                              id={`reset-img-${user.id}`}
                              checked={resetImages}
                              onChange={(e) => setResetImages(e.target.checked)}
                              className="w-4 h-4 rounded border-purple-500/30 bg-secondary accent-purple-500"
                            />
                            <label htmlFor={`reset-img-${user.id}`} className="text-xs text-purple-400">
                              Reset imej dijana ke 0
                            </label>
                          </div>
                        )}

                        {/* Per-Model Limits - Mobile (Only when editing) */}
                        {editingUser === user.id && (
                          <div className="pt-3 border-t border-border/30 mt-2">
                            <p className="text-[9px] font-bold text-cyan-400 uppercase mb-2">Had Setiap Model</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-muted-foreground">Sora 2</span>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={editLimits.sora2_limit}
                                    onChange={(e) => setEditLimits({ ...editLimits, sora2_limit: parseInt(e.target.value) || 0 })}
                                    className="w-12 h-6 text-xs bg-secondary border-cyan-500/30 p-1"
                                  />
                                  <span className="text-[8px] text-muted-foreground">({user.sora2_used})</span>
                                </div>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] text-amber-400">Sora Pro</span>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={editLimits.sora2pro_limit}
                                    onChange={(e) => setEditLimits({ ...editLimits, sora2pro_limit: parseInt(e.target.value) || 0 })}
                                    className="w-12 h-6 text-xs bg-secondary border-amber-500/30 p-1"
                                  />
                                  <span className="text-[8px] text-muted-foreground">({user.sora2pro_used})</span>
                                </div>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] text-violet-400">Veo 3</span>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={editLimits.veo3_limit}
                                    onChange={(e) => setEditLimits({ ...editLimits, veo3_limit: parseInt(e.target.value) || 0 })}
                                    className="w-12 h-6 text-xs bg-secondary border-violet-500/30 p-1"
                                  />
                                  <span className="text-[8px] text-muted-foreground">({user.veo3_used})</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          {editingUser === user.id ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleSaveLimits(user.id)}
                                className="h-9 flex-1 bg-success hover:bg-success/90 text-success-foreground"
                              >
                                <Save className="w-4 h-4 mr-1" />
                                Simpan
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingUser(null)}
                                className="h-9"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleEditLimits(user)}
                                className="h-9 bg-primary hover:bg-primary/90"
                              >
                                <Edit2 className="w-4 h-4 mr-1" />
                                Edit Had
                              </Button>
                              {!user.is_approved && (
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(user.id)}
                                  className="h-9 flex-1 bg-success/10 text-success hover:bg-success/20 border border-success/20"
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  Lulus
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleReject(user)}
                                className="h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-3 items-center">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{user.username || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          <p className="text-[10px] text-muted-foreground/60 font-mono">{user.id.slice(0, 12)}...</p>
                          {user.phone_number && (
                            <p className="text-xs text-muted-foreground mt-1">{user.phone_number}</p>
                          )}
                        </div>

                        <div>
                          {user.is_approved ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                              Diluluskan
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                              Menunggu
                            </Badge>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-lg font-bold text-foreground">{user.videos_used}</p>
                              <p className="text-[10px] text-muted-foreground">dijana</p>
                            </div>
                            <span className="text-muted-foreground">/</span>
                            <div>
                              <p className={`text-lg font-bold ${user.video_limit - user.videos_used <= 0 ? 'text-destructive' : 'text-green-500'}`}>
                                {Math.max(0, user.video_limit - user.videos_used)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">baki</p>
                            </div>
                          </div>
                        </div>

                        <div>
                          {editingUser === user.id ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  value={editLimits.video_limit}
                                  onChange={(e) => setEditLimits({ ...editLimits, video_limit: parseInt(e.target.value) || 0 })}
                                  className="w-20 h-9 bg-secondary border-border text-sm"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveLimits(user.id)}
                                  className="h-9 w-9 p-0 bg-success hover:bg-success/90"
                                >
                                  <Save className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingUser(null)}
                                  className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={resetVideos}
                                  onChange={(e) => setResetVideos(e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-border bg-secondary accent-primary"
                                />
                                <span className="text-[10px] text-muted-foreground">Reset dijana ke 0</span>
                              </label>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-foreground">{user.video_limit}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditLimits(user)}
                                className="h-9 w-9 p-0 text-muted-foreground hover:text-primary"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Image Stats Column */}
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-bold text-purple-400">{user.images_used}</span>
                            <span className="text-muted-foreground text-xs">/</span>
                            <span className={`text-sm font-bold ${user.image_limit - user.images_used <= 0 ? 'text-destructive' : 'text-green-400'}`}>
                              {Math.max(0, user.image_limit - user.images_used)}
                            </span>
                          </div>
                          <p className="text-[9px] text-muted-foreground">guna / baki</p>
                        </div>

                        {/* Had Imej Column */}
                        <div>
                          {editingUser === user.id ? (
                            <div className="flex flex-col gap-1">
                              <Input
                                type="number"
                                value={editLimits.image_limit}
                                onChange={(e) => setEditLimits({ ...editLimits, image_limit: parseInt(e.target.value) || 0 })}
                                className="w-16 h-8 bg-secondary border-border text-sm"
                              />
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={resetImages}
                                  onChange={(e) => setResetImages(e.target.checked)}
                                  className="w-3 h-3 rounded border-border"
                                />
                                <span className="text-[9px] text-purple-400">Reset imej</span>
                              </label>
                            </div>
                          ) : (
                            <span className="text-sm font-bold text-foreground">{user.image_limit}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {!user.is_approved && (
                            <Button
                              size="sm"
                              onClick={() => handleApprove(user.id)}
                              className="h-9 bg-success/10 text-success hover:bg-success/20 border border-success/20"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Lulus
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleReject(user)}
                            className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Results count */}
            {!loading && filteredUsers.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Menunjukkan {filteredUsers.length} daripada {users.length} pengguna
              </p>
            )}
          </>
        )}

        {/* Affiliate Tab */}
        {activeTab === 'affiliate' && (
          <>
            {/* Affiliate Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
              <div className="stat-card animate-fade-in" style={{ animationDelay: '50ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-xl">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{affiliateStats.totalAffiliates}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Jumlah Affiliate</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '100ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-500/10 rounded-xl">
                    <Link className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{affiliateStats.totalReferrals}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Total Referral</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '150ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-yellow-500/10 rounded-xl">
                    <Award className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{affiliateStats.activeAffiliates}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Affiliate Aktif</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl">
                    <DollarSign className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">RM{affiliateStats.estimatedCommission}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Anggaran Komisen</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Commission Setting */}
            <div className="glass-card p-4 mb-4 animate-fade-in" style={{ animationDelay: '220ms' }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Komisen per referral:</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">RM</span>
                  <Input
                    type="number"
                    value={commissionPerReferral}
                    onChange={(e) => setCommissionPerReferral(parseInt(e.target.value) || 0)}
                    className="w-20 h-9 bg-secondary border-border text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Top Affiliate Banner */}
            {affiliateStats.topAffiliate && (
              <div className="glass-card p-4 mb-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30 animate-fade-in" style={{ animationDelay: '240ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-yellow-500/20 rounded-xl">
                    <Award className="w-6 h-6 text-yellow-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-yellow-400 uppercase tracking-wide font-medium">🏆 Top Affiliate</p>
                    <p className="text-lg font-bold text-foreground">{affiliateStats.topAffiliate.username || affiliateStats.topAffiliate.email}</p>
                    <p className="text-sm text-muted-foreground">{affiliateStats.topAffiliate.referralCount} referral • RM{affiliateStats.topAffiliate.referralCount * commissionPerReferral} komisen</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedAffiliate(affiliateStats.topAffiliate)}
                    className="shrink-0 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Lihat
                  </Button>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative mb-4 md:mb-6 animate-fade-in" style={{ animationDelay: '260ms' }}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
              <Input
                placeholder="Cari affiliate atau kod referral..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 md:pl-12 bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground h-11 md:h-12 rounded-xl"
              />
            </div>

            {/* Affiliate List */}
            <div className="glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '280ms' }}>
              <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 p-4 border-b border-border/30 bg-muted/30">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Affiliate</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kod Referral</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Jumlah Referral</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Komisen</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tindakan</span>
              </div>

              <div className="divide-y divide-border/30">
                {loading ? (
                  <div className="flex items-center justify-center gap-3 py-16">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-muted-foreground">Memuatkan...</span>
                  </div>
                ) : filteredAffiliates.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    Tiada affiliate dijumpai
                  </div>
                ) : (
                  filteredAffiliates.map((affiliate, index) => (
                    <div
                      key={affiliate.userId}
                      className="p-4 data-table-row animate-fade-in hover:bg-muted/30 transition-colors"
                      style={{ animationDelay: `${300 + index * 50}ms` }}
                    >
                      {/* Mobile Layout */}
                      <div className="lg:hidden space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">{affiliate.username || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground truncate">{affiliate.email}</p>
                          </div>
                          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20 shrink-0">
                            {affiliate.referralCount} referral
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Kod:</span>
                            <code className="px-2 py-0.5 bg-secondary rounded text-xs font-mono text-primary">{affiliate.referralCode}</code>
                          </div>
                          <span className="text-emerald-400 font-medium">RM{affiliate.referralCount * commissionPerReferral}</span>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedAffiliate(affiliate)}
                            className="h-9 flex-1"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Lihat Referral
                          </Button>
                        </div>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 items-center">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{affiliate.username || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground truncate">{affiliate.email}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">Joined: {formatDate(affiliate.joinedAt)}</p>
                        </div>

                        <div>
                          <code className="px-2 py-1 bg-secondary rounded text-xs font-mono text-primary">{affiliate.referralCode}</code>
                        </div>

                        <div>
                          <p className="text-lg font-bold text-foreground">{affiliate.referralCount}</p>
                          <p className="text-[10px] text-muted-foreground">referral</p>
                        </div>

                        <div>
                          <p className="text-lg font-bold text-emerald-400">RM{affiliate.referralCount * commissionPerReferral}</p>
                          <p className="text-[10px] text-muted-foreground">anggaran</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedAffiliate(affiliate)}
                            className="h-9"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Lihat
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Results count */}
            {!loading && filteredAffiliates.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Menunjukkan {filteredAffiliates.length} affiliate
              </p>
            )}
          </>
        )}

        {/* Workflow Subscription Tab */}
        {activeTab === 'workflow' && (
          <>
            {/* Workflow Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
              <div className="stat-card animate-fade-in" style={{ animationDelay: '50ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-500/10 rounded-xl">
                    <UserCheck className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{workflowStats.active}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Aktif</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '100ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-500/10 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{workflowStats.expired}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Expired</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '150ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-yellow-500/10 rounded-xl">
                    <Clock className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{workflowStats.pending}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Belum Lulus</p>
                  </div>
                </div>
              </div>

              <div className="stat-card animate-fade-in" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-xl">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{workflowStats.approved}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">Pernah Lulus</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4 md:mb-6 animate-fade-in" style={{ animationDelay: '250ms' }}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
              <Input
                placeholder="Cari pengguna..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 md:pl-12 bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground h-11 md:h-12 rounded-xl"
              />
            </div>

            {/* User List for Workflow */}
            <div className="glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '300ms' }}>
              <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 p-4 border-b border-border/30 bg-muted/30">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pengguna</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Baki Hari</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tamat</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tindakan</span>
              </div>

              <div className="divide-y divide-border/30">
                {loading ? (
                  <div className="flex items-center justify-center gap-3 py-16">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-muted-foreground">Memuatkan...</span>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    Tiada pengguna dijumpai
                  </div>
                ) : (
                  filteredUsers.map((user, index) => {
                    const workflowStatus = getWorkflowStatus(user);
                    return (
                      <div
                        key={user.id}
                        className="p-4 data-table-row animate-fade-in"
                        style={{ animationDelay: `${350 + index * 30}ms` }}
                      >
                        {/* Mobile Layout */}
                        <div className="lg:hidden space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground truncate">{user.username || 'N/A'}</p>
                              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                            {workflowStatus.status === 'active' && (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                <Check className="w-3 h-3 mr-1" />
                                Aktif ({workflowStatus.daysLeft}d)
                              </Badge>
                            )}
                            {workflowStatus.status === 'expired' && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Expired
                              </Badge>
                            )}
                            {workflowStatus.status === 'pending' && (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                <Clock className="w-3 h-3 mr-1" />
                                Menunggu
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {editingWorkflowUser === user.id ? (
                              <>
                                <Input
                                  type="number"
                                  value={editWorkflowDays}
                                  onChange={(e) => setEditWorkflowDays(parseInt(e.target.value) || 30)}
                                  className="w-20 h-9 text-sm"
                                  placeholder="Hari"
                                />
                                <span className="text-xs text-muted-foreground">hari</span>
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveWorkflow(user.id, editWorkflowDays)}
                                  className="h-9 bg-green-600 hover:bg-green-700"
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  Lulus
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingWorkflowUser(null)}
                                  className="h-9"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                {workflowStatus.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setEditWorkflowDays(user.workflow_subscription_days || 30);
                                      setEditingWorkflowUser(user.id);
                                    }}
                                    className="h-9 bg-green-600 hover:bg-green-700"
                                  >
                                    <Check className="w-4 h-4 mr-1" />
                                    Approve
                                  </Button>
                                )}
                                {(workflowStatus.status === 'active' || workflowStatus.status === 'expired') && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditWorkflowDays(30);
                                        setEditingWorkflowUser(user.id);
                                      }}
                                      className="h-9 border-primary/30 text-primary"
                                    >
                                      <Calendar className="w-4 h-4 mr-1" />
                                      Lanjut
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleRevokeWorkflow(user.id)}
                                      className="h-9 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                                    >
                                      <X className="w-4 h-4 mr-1" />
                                      Tarik
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 items-center">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{user.username || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>

                          <div>
                            {workflowStatus.status === 'active' && (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                Aktif
                              </Badge>
                            )}
                            {workflowStatus.status === 'expired' && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                Expired
                              </Badge>
                            )}
                            {workflowStatus.status === 'pending' && (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                Menunggu
                              </Badge>
                            )}
                          </div>

                          <div>
                            {workflowStatus.status === 'active' ? (
                              <span className="text-lg font-bold text-green-400">{workflowStatus.daysLeft}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>

                          <div>
                            {user.workflow_subscription_ends_at ? (
                              <span className="text-xs text-muted-foreground">
                                {formatDate(user.workflow_subscription_ends_at)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {editingWorkflowUser === user.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  value={editWorkflowDays}
                                  onChange={(e) => setEditWorkflowDays(parseInt(e.target.value) || 30)}
                                  className="w-16 h-8 text-xs"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => workflowStatus.status === 'pending'
                                    ? handleApproveWorkflow(user.id, editWorkflowDays)
                                    : handleExtendWorkflow(user.id, editWorkflowDays)
                                  }
                                  className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingWorkflowUser(null)}
                                  className="h-8 w-8 p-0"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                {workflowStatus.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setEditWorkflowDays(user.workflow_subscription_days || 30);
                                      setEditingWorkflowUser(user.id);
                                    }}
                                    className="h-8 bg-green-600 hover:bg-green-700"
                                  >
                                    <Check className="w-4 h-4 mr-1" />
                                    Approve
                                  </Button>
                                )}
                                {(workflowStatus.status === 'active' || workflowStatus.status === 'expired') && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditWorkflowDays(30);
                                        setEditingWorkflowUser(user.id);
                                      }}
                                      className="h-8 text-xs"
                                    >
                                      <Calendar className="w-3 h-3 mr-1" />
                                      +Hari
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleRevokeWorkflow(user.id)}
                                      className="h-8 w-8 p-0 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Results count */}
            {!loading && filteredUsers.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Menunjukkan {filteredUsers.length} pengguna
              </p>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, user: null })}>
        <DialogContent className="bg-card border-border text-foreground max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="text-foreground">Padam Pengguna</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Adakah anda pasti ingin memadam pengguna <span className="text-primary font-medium">{deleteDialog.user?.email}</span>?
              Tindakan ini tidak boleh dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, user: null })}
              className="text-muted-foreground"
            >
              Batal
            </Button>
            <Button
              onClick={confirmReject}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Padam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Affiliate Detail Modal */}
      <Dialog open={!!selectedAffiliate} onOpenChange={(open) => !open && setSelectedAffiliate(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Link className="w-5 h-5 text-primary" />
              Detail Affiliate
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Senarai pengguna yang didaftarkan melalui kod referral affiliate ini.
            </DialogDescription>
          </DialogHeader>

          {selectedAffiliate && (
            <div className="space-y-4">
              {/* Affiliate Info */}
              <div className="p-4 bg-secondary/30 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Affiliate:</span>
                  <span className="text-sm font-medium text-foreground">{selectedAffiliate.username || selectedAffiliate.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Kod Referral:</span>
                  <code className="px-2 py-0.5 bg-secondary rounded text-xs font-mono text-primary">{selectedAffiliate.referralCode}</code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Referral:</span>
                  <span className="text-sm font-bold text-green-400">{selectedAffiliate.referralCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Anggaran Komisen:</span>
                  <span className="text-sm font-bold text-emerald-400">RM{selectedAffiliate.referralCount * commissionPerReferral}</span>
                </div>
              </div>

              {/* Referrals List */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Senarai Referral ({selectedAffiliate.referrals.length})</h4>
                {selectedAffiliate.referrals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Tiada referral lagi</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedAffiliate.referrals.map((referral, idx) => (
                      <div key={referral.id} className="p-3 bg-secondary/20 rounded-lg flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{referral.username || referral.email}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(referral.created_at)}</p>
                        </div>
                        {referral.is_approved ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20 shrink-0 text-[10px]">
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 shrink-0 text-[10px]">
                            Pending
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedAffiliate(null)}
              className="w-full"
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
