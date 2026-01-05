import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
    AutomationWorkflow,
    AutomationPostQueue,
    SocialMediaAccount,
    UserProfile
} from '@/types';
import WorkflowBuilder from '@/components/WorkflowBuilder';
import {
    Loader2,
    Plus,
    Play,
    Pause,
    Trash2,
    Settings,
    Send,
    MessageCircle,
    Facebook,
    Instagram,
    Youtube,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle
} from 'lucide-react';

interface AutomationDashboardProps {
    userProfile: UserProfile;
}

const AutomationDashboard: React.FC<AutomationDashboardProps> = ({ userProfile }) => {
    const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
    const [postQueue, setPostQueue] = useState<AutomationPostQueue[]>([]);
    const [socialAccounts, setSocialAccounts] = useState<SocialMediaAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'workflows' | 'queue' | 'accounts'>('overview');
    const [showBuilder, setShowBuilder] = useState(false);

    // Stats
    const [stats, setStats] = useState({
        totalWorkflows: 0,
        activeWorkflows: 0,
        pendingPosts: 0,
        completedToday: 0,
        failedToday: 0,
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // Load workflows
            const { data: workflowsData } = await supabase
                .from('automation_workflows')
                .select('*')
                .order('created_at', { ascending: false });

            // Load post queue
            const { data: queueData } = await supabase
                .from('automation_posts_queue')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            // Load social accounts
            const { data: accountsData } = await supabase
                .from('social_media_accounts')
                .select('*');

            // Load today's stats
            const today = new Date().toISOString().split('T')[0];
            const { data: historyData } = await supabase
                .from('automation_post_history')
                .select('status')
                .gte('posted_at', today);

            setWorkflows(workflowsData || []);
            setPostQueue(queueData || []);
            setSocialAccounts(accountsData || []);

            const completed = historyData?.filter(h => h.status === 'success').length || 0;
            const failed = historyData?.filter(h => h.status === 'failed').length || 0;

            setStats({
                totalWorkflows: workflowsData?.length || 0,
                activeWorkflows: workflowsData?.filter(w => w.is_active).length || 0,
                pendingPosts: queueData?.filter(q => ['pending', 'generating', 'ready'].includes(q.status)).length || 0,
                completedToday: completed,
                failedToday: failed,
            });

        } catch (error) {
            console.error('Error loading automation data:', error);
            toast.error('Gagal memuatkan data automation');
        } finally {
            setLoading(false);
        }
    };

    const getPlatformIcon = (platform: string) => {
        switch (platform) {
            case 'telegram':
                return <Send className="w-4 h-4" />;
            case 'facebook':
                return <Facebook className="w-4 h-4" />;
            case 'instagram':
                return <Instagram className="w-4 h-4" />;
            case 'youtube':
                return <Youtube className="w-4 h-4" />;
            default:
                return <MessageCircle className="w-4 h-4" />;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Siap</Badge>;
            case 'pending':
                return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Menunggu</Badge>;
            case 'generating':
                return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Menjana</Badge>;
            case 'posting':
                return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Mempost</Badge>;
            case 'failed':
                return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Gagal</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen pt-16 pb-24 px-4 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen pt-16 pb-24 px-3 sm:px-6 lg:px-8 overflow-y-auto"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6 animate-fade-in">
                    <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
                        AUTO <span className="text-primary neon-text">WORKFLOW</span>
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Automasikan penjanaan konten dan posting ke media sosial
                    </p>
                </div>

                {/* Coming Soon Banner for Non-Admin Users */}
                {!userProfile?.is_admin && (
                    <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/30 animate-fade-in">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/30 flex items-center justify-center flex-shrink-0">
                                <AlertCircle className="w-6 h-6 text-amber-400" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-amber-400 mb-1">
                                    🚧 Sistem Dalam Pembinaan
                                </h3>
                                <p className="text-sm text-amber-200/80 mb-3">
                                    Ciri-ciri automation ini sedang dibangunkan dan akan tersedia tidak lama lagi!
                                </p>
                                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <p className="text-xs text-amber-300 font-medium">
                                        💡 Untuk mengaktifkan automation penuh, anda perlu subscribe pakej bulanan.
                                        Nantikan pengumuman rasmi kami!
                                    </p>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Status:</span>
                                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                        Preview Mode
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <Card className="bg-slate-900/50 border-slate-700/50">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                                    <Settings className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-foreground">{stats.totalWorkflows}</p>
                                    <p className="text-xs text-muted-foreground">Workflows</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-slate-700/50">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-foreground">{stats.pendingPosts}</p>
                                    <p className="text-xs text-muted-foreground">Pending</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-slate-700/50">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                                    <CheckCircle className="w-5 h-5 text-green-400" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-foreground">{stats.completedToday}</p>
                                    <p className="text-xs text-muted-foreground">Hari Ini</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-slate-700/50">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                                    <XCircle className="w-5 h-5 text-red-400" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-foreground">{stats.failedToday}</p>
                                    <p className="text-xs text-muted-foreground">Gagal</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                    {['overview', 'workflows', 'queue', 'accounts'].map((tab) => (
                        <Button
                            key={tab}
                            variant={activeTab === tab ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setActiveTab(tab as typeof activeTab)}
                            className="capitalize whitespace-nowrap"
                        >
                            {tab === 'overview' && 'Ringkasan'}
                            {tab === 'workflows' && 'Workflows'}
                            {tab === 'queue' && 'Post Queue'}
                            {tab === 'accounts' && 'Akaun Sosial'}
                        </Button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Quick Actions */}
                        <Card className="bg-slate-900/50 border-slate-700/50">
                            <CardHeader>
                                <CardTitle className="text-lg">Tindakan Pantas</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Button className="justify-start gap-2" variant="outline" onClick={() => setShowBuilder(true)}>
                                        <Plus className="w-4 h-4" />
                                        Buat Workflow Baru
                                    </Button>
                                    <Button className="justify-start gap-2" variant="outline">
                                        <Send className="w-4 h-4" />
                                        Post Manual
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Connected Accounts */}
                        <Card className="bg-slate-900/50 border-slate-700/50">
                            <CardHeader>
                                <CardTitle className="text-lg">Akaun Bersambung</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {socialAccounts.length === 0 ? (
                                    <div className="text-center py-8">
                                        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                                        <p className="text-muted-foreground text-sm mb-3">Tiada akaun bersambung</p>
                                        <Button variant="outline" size="sm">
                                            <Plus className="w-4 h-4 mr-2" />
                                            Sambung Akaun
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {socialAccounts.map((account) => (
                                            <div key={account.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                                                <div className="flex items-center gap-3">
                                                    {getPlatformIcon(account.platform)}
                                                    <div>
                                                        <p className="text-sm font-medium capitalize">{account.platform}</p>
                                                        <p className="text-xs text-muted-foreground">{account.account_name || 'Connected'}</p>
                                                    </div>
                                                </div>
                                                <Badge className={account.is_connected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                                                    {account.is_connected ? 'Aktif' : 'Terputus'}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Recent Posts */}
                        <Card className="bg-slate-900/50 border-slate-700/50">
                            <CardHeader>
                                <CardTitle className="text-lg">Post Terkini</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {postQueue.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                                        <p className="text-muted-foreground text-sm">Tiada post dalam queue</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {postQueue.slice(0, 5).map((post) => (
                                            <div key={post.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm truncate">{post.caption || post.prompt_used || 'No caption'}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {post.platforms.map((p) => (
                                                            <span key={p} className="text-xs text-muted-foreground capitalize">{p}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                {getStatusBadge(post.status)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {activeTab === 'workflows' && (
                    <div className="animate-fade-in">
                        <Card className="bg-slate-900/50 border-slate-700/50">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-lg">Workflows</CardTitle>
                                <Button size="sm" className="gap-2" onClick={() => setShowBuilder(true)}>
                                    <Plus className="w-4 h-4" />
                                    Baru
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {workflows.length === 0 ? (
                                    <div className="text-center py-12">
                                        <Settings className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                                        <h3 className="text-lg font-bold text-foreground mb-2">Tiada Workflow</h3>
                                        <p className="text-muted-foreground text-sm mb-4">
                                            Buat workflow pertama anda untuk mula automasikan posting
                                        </p>
                                        <Button className="gap-2" onClick={() => setShowBuilder(true)}>
                                            <Plus className="w-4 h-4" />
                                            Buat Workflow Pertama
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {workflows.map((workflow) => (
                                            <div key={workflow.id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-bold text-foreground">{workflow.name}</h4>
                                                            <Badge className={workflow.is_active ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}>
                                                                {workflow.is_active ? 'Aktif' : 'Tidak Aktif'}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mb-2">{workflow.description || 'Tiada deskripsi'}</p>
                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                            <span className="capitalize">{workflow.content_type}</span>
                                                            <span>•</span>
                                                            <span>{workflow.duration}s</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Button variant="ghost" size="sm">
                                                            {workflow.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                                        </Button>
                                                        <Button variant="ghost" size="sm">
                                                            <Settings className="w-4 h-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" className="text-destructive">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {activeTab === 'queue' && (
                    <div className="animate-fade-in">
                        <Card className="bg-slate-900/50 border-slate-700/50">
                            <CardHeader>
                                <CardTitle className="text-lg">Post Queue</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {postQueue.length === 0 ? (
                                    <div className="text-center py-12">
                                        <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                                        <h3 className="text-lg font-bold text-foreground mb-2">Queue Kosong</h3>
                                        <p className="text-muted-foreground text-sm">
                                            Post yang dijadualkan akan muncul di sini
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {postQueue.map((post) => (
                                            <div key={post.id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {getStatusBadge(post.status)}
                                                            <span className="text-xs text-muted-foreground capitalize">{post.content_type}</span>
                                                        </div>
                                                        <p className="text-sm text-foreground mb-2 line-clamp-2">
                                                            {post.caption || post.prompt_used || 'No content'}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            {post.platforms.map((p) => (
                                                                <div key={p} className="flex items-center gap-1 text-xs text-muted-foreground">
                                                                    {getPlatformIcon(p)}
                                                                    <span className="capitalize">{p}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {post.content_url && (
                                                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-700/50 flex-shrink-0">
                                                            {post.content_type === 'image' ? (
                                                                <img src={post.content_url} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <video src={post.content_url} className="w-full h-full object-cover" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {activeTab === 'accounts' && (
                    <div className="animate-fade-in">
                        <Card className="bg-slate-900/50 border-slate-700/50">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-lg">Akaun Media Sosial</CardTitle>
                                <Button size="sm" className="gap-2">
                                    <Plus className="w-4 h-4" />
                                    Sambung
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-4">
                                    {/* Telegram */}
                                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                                    <Send className="w-5 h-5 text-blue-400" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-foreground">Telegram</h4>
                                                    <p className="text-xs text-muted-foreground">
                                                        {socialAccounts.find(a => a.platform === 'telegram')?.account_name || 'Tidak disambung'}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm">
                                                {socialAccounts.find(a => a.platform === 'telegram') ? 'Urus' : 'Sambung'}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Facebook */}
                                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                                                    <Facebook className="w-5 h-5 text-blue-500" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-foreground">Facebook</h4>
                                                    <p className="text-xs text-muted-foreground">
                                                        {socialAccounts.find(a => a.platform === 'facebook')?.account_name || 'Tidak disambung'}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm">
                                                {socialAccounts.find(a => a.platform === 'facebook') ? 'Urus' : 'Sambung'}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Instagram */}
                                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center">
                                                    <Instagram className="w-5 h-5 text-pink-400" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-foreground">Instagram</h4>
                                                    <p className="text-xs text-muted-foreground">
                                                        {socialAccounts.find(a => a.platform === 'instagram')?.account_name || 'Tidak disambung'}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm">
                                                {socialAccounts.find(a => a.platform === 'instagram') ? 'Urus' : 'Sambung'}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* YouTube */}
                                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                                                    <Youtube className="w-5 h-5 text-red-400" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-foreground">YouTube</h4>
                                                    <p className="text-xs text-muted-foreground">
                                                        {socialAccounts.find(a => a.platform === 'youtube')?.account_name || 'Tidak disambung'}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm">
                                                {socialAccounts.find(a => a.platform === 'youtube') ? 'Urus' : 'Sambung'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>

            {/* Workflow Builder Modal */}
            {showBuilder && (
                <WorkflowBuilder
                    userProfile={userProfile}
                    onClose={() => setShowBuilder(false)}
                    onSuccess={() => {
                        setShowBuilder(false);
                        loadData();
                    }}
                />
            )}
        </div>
    );
};

export default AutomationDashboard;
