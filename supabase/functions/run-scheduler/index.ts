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
            return new Response(
                JSON.stringify({ s: true, p: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get full schedule data only if there are items to process
        const { data: dueSchedules, error: scheduleError } = await supabase
            .from('automation_schedules')
            .select('id, workflow_id, schedule_type, hour_of_day, minute_of_hour')
            .eq('is_active', true)
            .lte('next_run_at', now);

        if (scheduleError || !dueSchedules) {
            return new Response(
                JSON.stringify({ s: false, e: 'fetch_error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
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

                // Check if there's already a pending/generating entry for this workflow
                const { count: existingCount } = await supabase
                    .from('automation_posts_queue')
                    .select('id', { count: 'exact', head: true })
                    .eq('workflow_id', workflow.id)
                    .in('status', ['pending', 'generating']);

                // Skip if already has pending/generating entry (prevent duplicates)
                if (existingCount && existingCount > 0) continue;

                // Create queue entry
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

                if (queueError) continue;

                // Calculate and update next run time
                const nextRunAt = calculateNextRunTime(schedule as AutomationSchedule);
                await supabase
                    .from('automation_schedules')
                    .update({ last_run_at: now, next_run_at: nextRunAt })
                    .eq('id', schedule.id);

                processedCount++;
            } catch {
                continue;
            }
        }

        return new Response(
            JSON.stringify({ s: true, p: processedCount }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ s: false }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
        let utcHour = mytHour - 8;
        let dayOffset = 1;

        if (utcHour < 0) {
            utcHour += 24;
            dayOffset = 0;
        }

        nextRun = new Date(now);
        nextRun.setUTCDate(nextRun.getUTCDate() + dayOffset);
        nextRun.setUTCHours(utcHour);
        nextRun.setUTCMinutes(schedule.minute_of_hour || 0);
        nextRun.setUTCSeconds(0);
        nextRun.setUTCMilliseconds(0);
    } else {
        nextRun = new Date(now.getTime() + 60 * 60 * 1000);
    }

    return nextRun.toISOString();
}

