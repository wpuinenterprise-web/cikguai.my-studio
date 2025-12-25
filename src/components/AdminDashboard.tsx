import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Check, X, Trash2, Edit2, Save, Users, Video, Shield } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
      // Delete from profiles (this will cascade due to foreign key)
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
    <div className="flex flex-col h-full bg-[#020617] p-4 md:p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <header className="mb-8">
          <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase mb-2">
            Admin <span className="text-cyan-500">Dashboard</span>
          </h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            Urus Pengguna & Monitor Penggunaan
          </p>
        </header>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <Users className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">{stats.total}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Jumlah Pengguna</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Check className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">{stats.approved}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Diluluskan</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <Shield className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">{stats.pending}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Menunggu</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Video className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">{stats.totalVideos}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Video Dijana</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <Input
            placeholder="Cari ID, email atau username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 bg-slate-900/50 border-slate-800 text-white placeholder:text-slate-600 h-12 rounded-xl"
          />
        </div>

        {/* Users Table */}
        <div className="bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Pengguna</TableHead>
                <TableHead className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Video</TableHead>
                <TableHead className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Had Video</TableHead>
                <TableHead className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-slate-500">Memuatkan...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                    Tiada pengguna dijumpai
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="border-slate-800 hover:bg-slate-800/30">
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-white font-medium text-sm">{user.username || 'N/A'}</p>
                        <p className="text-slate-500 text-xs">{user.email}</p>
                        <p className="text-slate-600 text-[10px] font-mono">{user.id.slice(0, 8)}...</p>
                        {user.phone_number && (
                          <p className="text-slate-500 text-xs">{user.phone_number}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.is_approved ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20">
                          Diluluskan
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20">
                          Menunggu
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-white font-bold">{user.videos_used}</p>
                        <p className="text-slate-500 text-[10px]">dijana</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingUser === user.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={editLimits.video_limit}
                            onChange={(e) => setEditLimits({ ...editLimits, video_limit: parseInt(e.target.value) || 0 })}
                            className="w-20 h-8 bg-slate-800 border-slate-700 text-white text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveLimits(user.id)}
                            className="h-8 w-8 p-0 bg-green-500 hover:bg-green-600"
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingUser(null)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold">{user.video_limit}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditLimits(user)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-cyan-500"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {!user.is_approved && (
                          <Button
                            size="sm"
                            onClick={() => handleApprove(user.id)}
                            className="h-8 bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Lulus
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReject(user)}
                          className="h-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, user: null })}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Padam Pengguna</DialogTitle>
            <DialogDescription className="text-slate-400">
              Adakah anda pasti ingin memadam pengguna <span className="text-cyan-500 font-medium">{deleteDialog.user?.email}</span>? 
              Tindakan ini tidak boleh dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteDialog({ open: false, user: null })}
              className="text-slate-400 hover:text-white"
            >
              Batal
            </Button>
            <Button
              onClick={confirmReject}
              className="bg-red-500 hover:bg-red-600 text-white"
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
