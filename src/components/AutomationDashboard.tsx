import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    AlertCircle,
    X,
    Zap,
    RefreshCw
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

    // Telegram Connection Modal
    const [showTelegramModal, setShowTelegramModal] = useState(false);
    const [telegramChatId, setTelegramChatId] = useState('');
    const [telegramBotToken, setTelegramBotToken] = useState('');
    const [telegramSaving, setTelegramSaving] = useState(false);
    const [testingConnection, setTestingConnection] = useState(false);

    // Delete Confirmation Modal
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [workflowToDelete, setWorkflowToDelete] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Stats
    const [stats, setStats] = useState({
        totalWorkflows: 0,
        activeWorkflows: 0,
        pendingPosts: 0,
        completedToday: 0,
        failedToday: 0,
    });

    // Subscription Status Check
    const getSubscriptionStatus = () => {
        // Admin bypass - admin always has full access
        if ((userProfile as any).is_admin) {
            return { isActive: true, status: 'active' as const, daysLeft: 9999 };
        }

        const isApproved = (userProfile as any).workflow_access_approved;
        const expiryDate = (userProfile as any).workflow_subscription_ends_at;

        if (!isApproved) {
            return { isActive: false, status: 'pending' as const, daysLeft: 0 };
        }
        if (!expiryDate) {
            return { isActive: false, status: 'pending' as const, daysLeft: 0 };
        }

        const now = new Date();
        const expiry = new Date(expiryDate);
        const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 0) {
            return { isActive: false, status: 'expired' as const, daysLeft: 0 };
        }

        return { isActive: true, status: 'active' as const, daysLeft };
    };

    const subscriptionStatus = getSubscriptionStatus();

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

            setWorkflows((workflowsData || []) as unknown as AutomationWorkflow[]);
            setPostQueue((queueData || []) as unknown as AutomationPostQueue[]);
            setSocialAccounts((accountsData || []) as unknown as SocialMediaAccount[]);

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

    // Save Telegram Connection
    const saveTelegramConnection = async () => {
        if (!telegramBotToken.trim()) {
            toast.error('Sila masukkan Bot Token');
            return;
        }
        if (!telegramChatId.trim()) {
            toast.error('Sila masukkan Chat ID Telegram');
            return;
        }

        setTelegramSaving(true);
        try {
            // Check if account already exists
            const { data: existing } = await supabase
                .from('social_media_accounts')
                .select('id')
                .eq('user_id', userProfile.id)
                .eq('platform', 'telegram')
                .maybeSingle();

            const extraData = {
                chat_id: telegramChatId.trim(),
                bot_token: telegramBotToken.trim(),
            };

            if (existing) {
                // Update existing
                await supabase
                    .from('social_media_accounts')
                    .update({
                        extra_data: extraData,
                        is_connected: true,
                        account_name: telegramChatId.trim(),
                    })
                    .eq('id', existing.id);
            } else {
                // Create new
                await supabase
                    .from('social_media_accounts')
                    .insert({
                        user_id: userProfile.id,
                        platform: 'telegram',
                        account_name: telegramChatId.trim(),
                        extra_data: extraData,
                        is_connected: true,
                    });
            }

            toast.success('Telegram berjaya disambung!');
            setShowTelegramModal(false);
            setTelegramChatId('');
            setTelegramBotToken('');
            loadData();
        } catch (error) {
            console.error('Error saving Telegram:', error);
            toast.error('Gagal menyimpan Telegram');
        } finally {
            setTelegramSaving(false);
        }
    };

    // Open Telegram Modal and load existing data
    const openTelegramModal = () => {
        // Find existing Telegram account
        const telegramAccount = socialAccounts.find(a => a.platform === 'telegram');
        if (telegramAccount?.extra_data) {
            const extraData = telegramAccount.extra_data as { chat_id?: string; bot_token?: string };
            setTelegramChatId(extraData.chat_id || '');
            setTelegramBotToken(extraData.bot_token || '');
        } else {
            setTelegramChatId('');
            setTelegramBotToken('');
        }
        setShowTelegramModal(true);
    };

    // Test Telegram Connection
    const testTelegramConnection = async () => {
        if (!telegramBotToken.trim()) {
            toast.error('Sila masukkan Bot Token');
            return;
        }
        if (!telegramChatId.trim()) {
            toast.error('Sila masukkan Chat ID Telegram');
            return;
        }

        setTestingConnection(true);
        try {
            const { data, error } = await supabase.functions.invoke('post-telegram', {
                body: {
                    chat_id: telegramChatId.trim(),
                    bot_token: telegramBotToken.trim(),
                    content_url: 'https://picsum.photos/400/300',
                    content_type: 'image',
                    caption: '✅ Test connection berjaya!\n\nAkaun Telegram anda telah berjaya disambung dengan sistem automation.',
                }
            });

            if (error) throw error;

            if (data.success) {
                toast.success('✅ Test message dihantar! Check Telegram anda.');
            } else {
                throw new Error(data.error || 'Test failed');
            }
        } catch (error) {
            console.error('Error testing Telegram:', error);
            toast.error('Gagal hantar test message. Pastikan Bot Token dan Chat ID betul, dan bot sudah ditambah ke channel/group.');
        } finally {
            setTestingConnection(false);
        }
    };

    // Trigger Manual Run
    const triggerManualRun = async () => {
        try {
            toast.info('Memproses workflow...');
            const { data, error } = await supabase.functions.invoke('run-scheduler');

            if (error) throw error;

            if (data.processed > 0) {
                toast.success(`${data.processed} workflow sedang diproses!`);
            } else {
                toast.info('Tiada workflow yang perlu dijalankan');
            }

            // Reload data after a delay
            setTimeout(() => loadData(), 3000);
        } catch (error) {
            console.error('Error triggering run:', error);
            toast.error('Gagal trigger workflow');
        }
    };

    // Process Queue - Process pending/generating items
    const processQueue = async () => {
        try {
            toast.info('Memproses queue...');
            const { data, error } = await supabase.functions.invoke('process-automation');

            if (error) throw error;

            if (data.processed > 0) {
                toast.success(`${data.processed} item berjaya diproses!`);
            } else {
                toast.info('Tiada item untuk diproses');
            }

            // Reload data
            setTimeout(() => loadData(), 2000);
        } catch (error) {
            console.error('Error processing queue:', error);
            toast.error('Gagal proses queue');
        }
    };

    // Sync Queue Status with History - fix stuck generating items
    const syncQueueStatus = async () => {
        try {
            toast.info('Menyegerakkan status...');

            // Get queue items that are generating
            const { data: generatingItems } = await supabase
                .from('automation_posts_queue')
                .select('id')
                .eq('status', 'generating');

            if (generatingItems && generatingItems.length > 0) {
                // Check history for these items
                for (const item of generatingItems) {
                    const { data: historyItem } = await supabase
                        .from('automation_post_history')
                        .select('status, content_url')
                        .eq('queue_id', item.id)
                        .order('posted_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (historyItem) {
                        // Update queue status based on history
                        await supabase
                            .from('automation_posts_queue')
                            .update({
                                status: historyItem.status === 'success' ? 'completed' : 'failed',
                                content_url: historyItem.content_url
                            })
                            .eq('id', item.id);
                    }
                }
            }

            toast.success('Status berjaya disegerakkan');
            loadData();
        } catch (error) {
            console.error('Error syncing status:', error);
            toast.error('Gagal segerak status');
        }
    };

    // Retry posting to Telegram for items with content but not posted
    const retryPosting = async (queueId: string) => {
        try {
            toast.info('Cuba semula posting...');
            const { data, error } = await supabase.functions.invoke('post-telegram', {
                body: { queue_id: queueId }
            });

            if (error) throw error;

            toast.success('Posting berjaya dicuba semula!');
            loadData();
        } catch (error) {
            console.error('Error retrying post:', error);
            toast.error('Gagal cuba semula posting');
        }
    };

    // Open Delete Confirmation Modal
    const openDeleteModal = (workflowId: string, workflowName: string) => {
        setWorkflowToDelete({ id: workflowId, name: workflowName });
        setShowDeleteModal(true);
    };

    // Confirm Delete Workflow
    const confirmDeleteWorkflow = async () => {
        if (!workflowToDelete) return;

        setDeleting(true);
        try {
            // First delete related schedules
            await supabase
                .from('automation_schedules')
                .delete()
                .eq('workflow_id', workflowToDelete.id);

            // Then delete the workflow
            const { error } = await supabase
                .from('automation_workflows')
                .delete()
                .eq('id', workflowToDelete.id);

            if (error) throw error;

            toast.success('Workflow berjaya dipadam');
            setShowDeleteModal(false);
            setWorkflowToDelete(null);
            loadData();
        } catch (error) {
            console.error('Error deleting workflow:', error);
            toast.error('Gagal padam workflow');
        } finally {
            setDeleting(false);
        }
    };

    // Toggle Workflow Active Status
    const toggleWorkflowStatus = async (workflowId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('automation_workflows')
                .update({ is_active: !currentStatus })
                .eq('id', workflowId);

            if (error) throw error;

            // Also update the schedule
            await supabase
                .from('automation_schedules')
                .update({ is_active: !currentStatus })
                .eq('workflow_id', workflowId);

            toast.success(currentStatus ? 'Workflow dijeda' : 'Workflow diaktifkan');
            loadData();
        } catch (error) {
            console.error('Error toggling workflow:', error);
            toast.error('Gagal kemaskini status workflow');
        }
    };

    // Edit Workflow
    const [editingWorkflow, setEditingWorkflow] = useState<AutomationWorkflow | null>(null);

    const openEditWorkflow = (workflow: AutomationWorkflow) => {
        setEditingWorkflow(workflow);
        setShowBuilder(true);
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

                {/* Subscription Status Banner */}
                {!subscriptionStatus.isActive && (
                    <div className={`mb-6 p-5 rounded-2xl border animate-fade-in ${subscriptionStatus.status === 'expired'
                        ? 'bg-gradient-to-r from-red-500/20 via-rose-500/20 to-red-500/20 border-red-500/30'
                        : 'bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border-amber-500/30'
                        }`}>
                        <div className="flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${subscriptionStatus.status === 'expired' ? 'bg-red-500/30' : 'bg-amber-500/30'
                                }`}>
                                <AlertCircle className={`w-6 h-6 ${subscriptionStatus.status === 'expired' ? 'text-red-400' : 'text-amber-400'
                                    }`} />
                            </div>
                            <div className="flex-1">
                                {subscriptionStatus.status === 'expired' ? (
                                    <>
                                        <h3 className="text-lg font-bold text-red-400 mb-1">
                                            ⏰ Subscription Tamat
                                        </h3>
                                        <p className="text-sm text-red-200/80 mb-3">
                                            Subscription workflow automation anda telah tamat. Sila hubungi admin untuk subscribe semula.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="text-lg font-bold text-amber-400 mb-1">
                                            🔒 Akses Workflow Terhad
                                        </h3>
                                        <p className="text-sm text-amber-200/80 mb-3">
                                            Anda belum subscribe untuk workflow automation. Sila hubungi admin untuk mohon akses.
                                        </p>
                                    </>
                                )}
                                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                    <p className="text-xs text-muted-foreground font-medium">
                                        💡 Dengan subscription aktif, anda boleh:
                                    </p>
                                    <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                        <li>• Auto-generate video dengan AI prompt</li>
                                        <li>• Schedule posting ke Telegram</li>
                                        <li>• Pilih CTA untuk FB/TikTok/Umum</li>
                                    </ul>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Status:</span>
                                    <Badge className={`${subscriptionStatus.status === 'expired'
                                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                        : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                        }`}>
                                        {subscriptionStatus.status === 'expired' ? 'Expired' : 'Belum Subscribe'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active Subscription Countdown */}
                {subscriptionStatus.isActive && subscriptionStatus.daysLeft <= 7 && (
                    <div className="mb-6 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 animate-fade-in">
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-orange-400" />
                            <p className="text-sm text-orange-300">
                                ⚠️ Subscription anda akan tamat dalam <strong>{subscriptionStatus.daysLeft} hari</strong>. Hubungi admin untuk lanjutkan.
                            </p>
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
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        className="justify-center gap-2 min-h-[48px] touch-manipulation"
                                        variant="outline"
                                        onClick={() => setShowBuilder(true)}
                                        disabled={!subscriptionStatus.isActive}
                                    >
                                        <Plus className="w-4 h-4" />
                                        <span className="text-xs sm:text-sm">Buat Workflow</span>
                                    </Button>
                                    <Button
                                        className="justify-center gap-2 min-h-[48px] touch-manipulation"
                                        variant="outline"
                                        onClick={openTelegramModal}
                                    >
                                        <Send className="w-4 h-4" />
                                        <span className="text-xs sm:text-sm">Telegram</span>
                                    </Button>
                                    <Button
                                        className="justify-center gap-2 min-h-[48px] touch-manipulation bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={triggerManualRun}
                                        disabled={!subscriptionStatus.isActive}
                                    >
                                        <Zap className="w-4 h-4" />
                                        <span className="text-xs sm:text-sm">Trigger</span>
                                    </Button>
                                    <Button
                                        className="justify-center gap-2 min-h-[48px] touch-manipulation bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={processQueue}
                                        disabled={!subscriptionStatus.isActive}
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        <span className="text-xs sm:text-sm">Proses</span>
                                    </Button>
                                    <Button
                                        className="justify-center gap-2 min-h-[48px] touch-manipulation col-span-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={syncQueueStatus}
                                        disabled={!subscriptionStatus.isActive}
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        <span className="text-xs sm:text-sm">Sync Status Queue</span>
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
                                        <Button
                                            className="gap-2"
                                            onClick={() => setShowBuilder(true)}
                                            disabled={!subscriptionStatus.isActive}
                                        >
                                            <Plus className="w-4 h-4" />
                                            Buat Workflow Pertama
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {workflows.map((workflow) => (
                                            <div key={workflow.id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                                {/* Header with name and badge */}
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className="font-bold text-foreground truncate">{workflow.name}</h4>
                                                            <Badge className={workflow.is_active ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}>
                                                                {workflow.is_active ? 'Aktif' : 'Tidak Aktif'}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{workflow.description || 'Tiada deskripsi'}</p>
                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                            <span className="capitalize">{workflow.content_type}</span>
                                                            <span>•</span>
                                                            <span>{workflow.duration}s</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Action buttons - full width on mobile */}
                                                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-700/50">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="min-h-[44px] gap-1 touch-manipulation flex flex-col sm:flex-row items-center justify-center disabled:opacity-50"
                                                        disabled={!subscriptionStatus.isActive}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            toggleWorkflowStatus(workflow.id, workflow.is_active);
                                                        }}
                                                    >
                                                        {workflow.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                                        <span className="text-[10px] sm:text-xs">{workflow.is_active ? 'Jeda' : 'Aktif'}</span>
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="min-h-[44px] gap-1 touch-manipulation flex flex-col sm:flex-row items-center justify-center disabled:opacity-50"
                                                        disabled={!subscriptionStatus.isActive}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            openEditWorkflow(workflow);
                                                        }}
                                                    >
                                                        <Settings className="w-4 h-4" />
                                                        <span className="text-[10px] sm:text-xs">Edit</span>
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="min-h-[44px] gap-1 touch-manipulation flex flex-col sm:flex-row items-center justify-center text-destructive border-destructive/50 hover:bg-destructive/10 disabled:opacity-50"
                                                        disabled={!subscriptionStatus.isActive}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            openDeleteModal(workflow.id, workflow.name);
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        <span className="text-[10px] sm:text-xs">Padam</span>
                                                    </Button>
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
                                            <div className="flex items-center gap-2">
                                                {socialAccounts.find(a => a.platform === 'telegram') && (
                                                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                        Aktif
                                                    </Badge>
                                                )}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={openTelegramModal}
                                                >
                                                    {socialAccounts.find(a => a.platform === 'telegram') ? 'Urus' : 'Sambung'}
                                                </Button>
                                            </div>
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
                    editWorkflow={editingWorkflow}
                    onClose={() => {
                        setShowBuilder(false);
                        setEditingWorkflow(null);
                    }}
                    onSuccess={() => {
                        setShowBuilder(false);
                        setEditingWorkflow(null);
                        loadData();
                    }}
                />
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && workflowToDelete && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <Card className="w-full max-w-sm bg-slate-900 border-slate-700">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2 text-red-400">
                                <Trash2 className="w-5 h-5" />
                                Padam Workflow
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-muted-foreground">
                                Adakah anda pasti mahu padam workflow <strong className="text-foreground">"{workflowToDelete.name}"</strong>?
                            </p>
                            <p className="text-sm text-amber-400">
                                ⚠️ Tindakan ini tidak boleh dibatalkan.
                            </p>
                            <div className="flex gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                        setShowDeleteModal(false);
                                        setWorkflowToDelete(null);
                                    }}
                                    disabled={deleting}
                                >
                                    Batal
                                </Button>
                                <Button
                                    variant="destructive"
                                    className="flex-1 gap-2"
                                    onClick={confirmDeleteWorkflow}
                                    disabled={deleting}
                                >
                                    {deleting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Mempadam...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4" />
                                            Padam
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Telegram Connection Modal */}
            {showTelegramModal && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <Card className="w-full max-w-md bg-slate-900 border-slate-700">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Send className="w-5 h-5 text-blue-400" />
                                Sambung Telegram
                            </CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setShowTelegramModal(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                <p className="text-xs text-blue-300">
                                    <strong>Langkah Setup:</strong>
                                </p>
                                <ol className="text-xs text-blue-200/80 mt-2 space-y-1 list-decimal list-inside">
                                    <li>Buat bot di @BotFather (dapatkan token)</li>
                                    <li>Masukkan Bot Token di bawah</li>
                                    <li>Tambah bot ke channel/group anda sebagai admin</li>
                                    <li>Dapatkan Chat ID channel/group anda</li>
                                    <li>Masukkan Chat ID dan test connection</li>
                                </ol>
                            </div>

                            <div>
                                <Label className="text-sm font-medium mb-2 block">
                                    Bot Token (dari @BotFather)
                                </Label>
                                <Input
                                    type="password"
                                    placeholder="123456789:ABC-DEF..."
                                    value={telegramBotToken}
                                    onChange={(e) => setTelegramBotToken(e.target.value)}
                                    className="bg-slate-800/50 font-mono text-xs"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Token bot anda akan disimpan dengan selamat
                                </p>
                            </div>

                            <div>
                                <Label className="text-sm font-medium mb-2 block">
                                    Chat ID Telegram
                                </Label>
                                <Input
                                    placeholder="@channelname atau -1001234567890"
                                    value={telegramChatId}
                                    onChange={(e) => setTelegramChatId(e.target.value)}
                                    className="bg-slate-800/50"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Contoh: @YourChannel atau -1001234567890
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    className="flex-1 gap-2"
                                    onClick={testTelegramConnection}
                                    disabled={testingConnection || !telegramChatId.trim()}
                                >
                                    {testingConnection ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Testing...
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="w-4 h-4" />
                                            Test Connection
                                        </>
                                    )}
                                </Button>
                                <Button
                                    className="flex-1 gap-2"
                                    onClick={saveTelegramConnection}
                                    disabled={telegramSaving || !telegramChatId.trim()}
                                >
                                    {telegramSaving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Menyimpan...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4" />
                                            Simpan
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default AutomationDashboard;
