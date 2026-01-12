import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutomationSchedule {
    id: string;
    workflow_id: string;
    schedule_type: string;
    hour_of_day: number | null;
    minute_of_hour: number;
    timezone: string;
    next_run_at: string | null;
    is_active: boolean;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const now = new Date().toISOString();

        // Quick count check first (minimal query)
        const { count } = await supabase
            .from('automation_schedules')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .lte('next_run_at', now);

        if (!count || count === 0) {
            return new Response('0', { headers: corsHeaders });
        }

        // Get full schedule data only if there are items to process
        const { data: dueSchedules, error: scheduleError } = await supabase
            .from('automation_schedules')
            .select('id, workflow_id, schedule_type, hour_of_day, minute_of_hour')
            .eq('is_active', true)
            .lte('next_run_at', now);

        if (scheduleError || !dueSchedules) {
            return new Response('e', { status: 500, headers: corsHeaders });
        }

        let processedCount = 0;

        for (const schedule of dueSchedules) {
            try {
                const { data: workflow } = await supabase
                    .from('automation_workflows')
                    .select('id, user_id, name, content_type, prompt_template, caption_template')
                    .eq('id', schedule.workflow_id)
                    .eq('is_active', true)
                    .single();

                if (!workflow) continue;

                // Check user subscription
                const { data: userProfile } = await supabase
                    .from('profiles')
                    .select('workflow_access_approved, workflow_subscription_ends_at')
                    .eq('id', workflow.user_id)
                    .single();

                if (!userProfile?.workflow_access_approved) continue;
                if (userProfile.workflow_subscription_ends_at && new Date(userProfile.workflow_subscription_ends_at) < new Date()) continue;

                // Check Telegram connection
                const { data: telegramAccount } = await supabase
                    .from('social_media_accounts')
                    .select('extra_data')
                    .eq('user_id', workflow.user_id)
                    .eq('platform', 'telegram')
                    .eq('is_connected', true)
                    .single();

                if (!telegramAccount?.extra_data?.chat_id) continue;

                // ANTI-DUPLICATE CHECK: Check for any entry created in last 30 minutes
                // Increased from 20 to 30 minutes for extra safety
                const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
                const { count: recentCount } = await supabase
                    .from('automation_posts_queue')
                    .select('id', { count: 'exact', head: true })
                    .eq('workflow_id', workflow.id)
                    .gte('created_at', thirtyMinutesAgo);

                // Skip if any entry created in last 30 minutes (prevents ALL duplicates)
                if (recentCount && recentCount > 0) continue;

                // RACE CONDITION FIX: Calculate and update next_run_at IMMEDIATELY
                // This acts as a "lock" - if another cron run checks, schedule won't be due anymore
                const nextRunAt = schedule.schedule_type === 'once'
                    ? null  // One-time schedules get nulled
                    : calculateNextRunTime(schedule as AutomationSchedule);

                const scheduleUpdate = schedule.schedule_type === 'once'
                    ? { next_run_at: null, is_active: false }
                    : { next_run_at: nextRunAt };

                // Update schedule FIRST to prevent race condition
                const { error: lockError } = await supabase
                    .from('automation_schedules')
                    .update(scheduleUpdate)
                    .eq('id', schedule.id)
                    .eq('is_active', true); // Only update if still active (atomic check)

                if (lockError) continue;

                // Now create queue entry (schedule is already "locked")
                const { error: queueError } = await supabase
                    .from('automation_posts_queue')
                    .insert({
                        workflow_id: workflow.id,
                        user_id: workflow.user_id,
                        content_type: workflow.content_type,
                        prompt_used: workflow.prompt_template,
                        caption: workflow.caption_template,
                        platforms: ['telegram'],
                        status: 'pending',
                        scheduled_for: now,
                    });

                if (queueError) {
                    // If queue insert failed, we need to restore schedule (rollback)
                    // But for safety, keep schedule locked to prevent duplicates
                    continue;
                }

                // Update last_run_at (schedule's next_run_at already updated above)
                await supabase
                    .from('automation_schedules')
                    .update({ last_run_at: now })
                    .eq('id', schedule.id);

                // For 'once' schedule type, also deactivate the workflow
                if (schedule.schedule_type === 'once') {
                    await supabase
                        .from('automation_workflows')
                        .update({ is_active: false })
                        .eq('id', workflow.id);
                }

                processedCount++;
            } catch {
                continue;
            }
        }

        return new Response(String(processedCount), { headers: corsHeaders });

    } catch {
        return new Response('e', { status: 500, headers: corsHeaders });
    }
});

function calculateNextRunTime(schedule: AutomationSchedule): string {
    const now = new Date();
    let nextRun: Date;

    if (schedule.schedule_type === 'hourly') {
        nextRun = new Date(now);
        nextRun.setUTCHours(nextRun.getUTCHours() + 1);
        nextRun.setUTCMinutes(schedule.minute_of_hour || 0);
        nextRun.setUTCSeconds(0);
        nextRun.setUTCMilliseconds(0);
    } else if (schedule.schedule_type === 'daily') {
        const mytHour = schedule.hour_of_day || 9;
        let utcHour = mytHour - 8; // Convert MYT to UTC

        if (utcHour < 0) {
            utcHour += 24;
        }

        // Calculate next occurrence
        nextRun = new Date(now);
        nextRun.setUTCHours(utcHour);
        nextRun.setUTCMinutes(schedule.minute_of_hour || 0);
        nextRun.setUTCSeconds(0);
        nextRun.setUTCMilliseconds(0);

        // If calculated time is in the past or too close (within 1 hour), add 1 day
        if (nextRun.getTime() <= now.getTime() + 60 * 60 * 1000) {
            nextRun.setUTCDate(nextRun.getUTCDate() + 1);
        }
    } else {
        // Default: 1 hour from now
        nextRun = new Date(now.getTime() + 60 * 60 * 1000);
    }

    // SAFETY: Ensure next run is ALWAYS at least 30 minutes in the future
    const minNextRun = new Date(now.getTime() + 30 * 60 * 1000);
    if (nextRun.getTime() < minNextRun.getTime()) {
        nextRun = minNextRun;
    }

    return nextRun.toISOString();
}

