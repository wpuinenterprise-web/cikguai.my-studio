import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Check, X, Trash2, Edit2, Save, Users, Video, Shield, RefreshCw, UserCheck, Clock } from 'lucide-react';
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
  created_at: string;
}

const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editLimits, setEditLimits] = useState({ video_limit: 0, image_limit: 0 });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: UserData | null }>({
    open: false,
    user: null,
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
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
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', deleteDialog.user.id);

      if (error) throw error;
      
      toast.success('Pengguna telah ditolak dan dipadam');
      setDeleteDialog({ open: false, user: null });
      fetchUsers();
    } catch (error: any) {
      toast.error('Gagal memadam pengguna');
      console.error('Error deleting user:', error);
    }
  };

  const handleEditLimits = (user: UserData) => {
    setEditingUser(user.id);
    setEditLimits({ video_limit: user.video_limit, image_limit: user.image_limit });
  };

  const handleSaveLimits = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          video_limit: editLimits.video_limit, 
          image_limit: editLimits.image_limit 
        })
        .eq('id', userId);

      if (error) throw error;
      
      toast.success('Had pengguna telah dikemaskini');
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      toast.error('Gagal mengemaskini had');
    }
  };

  const filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: users.length,
    approved: users.filter(u => u.is_approved).length,
    pending: users.filter(u => !u.is_approved).length,
    totalVideos: users.reduce((acc, u) => acc + u.videos_used, 0),
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
                Urus pengguna & monitor penggunaan sistem
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

        {/* Stats Cards - Mobile optimized */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
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

        {/* Users List - Mobile Card View / Desktop Table */}
        <div className="glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '300ms' }}>
          {/* Desktop Table Header */}
          <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 p-4 border-b border-border/30 bg-muted/30">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pengguna</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Video Guna</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Had Video</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tindakan</span>
          </div>

          {/* Content */}
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
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          Video: <span className="text-foreground font-medium">{user.videos_used}</span>
                        </span>
                        {editingUser === user.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Had:</span>
                            <Input
                              type="number"
                              value={editLimits.video_limit}
                              onChange={(e) => setEditLimits({ ...editLimits, video_limit: parseInt(e.target.value) || 0 })}
                              className="w-16 h-8 text-sm bg-secondary border-border"
                            />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            Had: <span className="text-foreground font-medium">{user.video_limit}</span>
                          </span>
                        )}
                      </div>
                    </div>

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
                            variant="outline"
                            onClick={() => handleEditLimits(user)}
                            className="h-9"
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            Edit
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
                  <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 items-center">
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
                      <p className="text-lg font-bold text-foreground">{user.videos_used}</p>
                      <p className="text-[10px] text-muted-foreground">dijana</p>
                    </div>

                    <div>
                      {editingUser === user.id ? (
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
    </div>
  );
};

export default AdminDashboard;
