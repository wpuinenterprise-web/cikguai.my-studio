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

interface AutomationWorkflow {
    id: string;
    user_id: string;
    name: string;
    content_type: string;
    prompt_template: string;
    caption_template: string;
    aspect_ratio: string;
    duration: number;
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

        console.log('🕐 Running automation scheduler...');

        // Get schedules that are due to run
        const now = new Date().toISOString();

        const { data: dueSchedules, error: scheduleError } = await supabase
            .from('automation_schedules')
            .select(`
        id,
        workflow_id,
        schedule_type,
        hour_of_day,
        minute_of_hour,
        timezone,
        next_run_at,
        is_active
      `)
            .eq('is_active', true)
            .lte('next_run_at', now);

        if (scheduleError) {
            console.error('Error fetching schedules:', scheduleError);
            throw scheduleError;
        }

        console.log(`Found ${dueSchedules?.length || 0} schedules due to run`);

        if (!dueSchedules || dueSchedules.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'No schedules due to run',
                    processed: 0
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        let processedCount = 0;
        const errors: string[] = [];

        for (const schedule of dueSchedules) {
            try {
                // Get workflow details
                const { data: workflow, error: workflowError } = await supabase
                    .from('automation_workflows')
                    .select('*')
                    .eq('id', schedule.workflow_id)
                    .eq('is_active', true)
                    .single();

                if (workflowError || !workflow) {
                    console.log(`Workflow ${schedule.workflow_id} not found or inactive`);
                    continue;
                }

                console.log(`Processing workflow: ${workflow.name}`);

                // Check user's subscription status
                const { data: userProfile } = await supabase
                    .from('profiles')
                    .select('workflow_access_approved, workflow_subscription_ends_at')
                    .eq('id', workflow.user_id)
                    .single();

                if (!userProfile?.workflow_access_approved) {
                    console.log(`User ${workflow.user_id} not approved for workflow access`);
                    errors.push(`Workflow "${workflow.name}": User not approved for workflows`);
                    continue;
                }

                if (userProfile.workflow_subscription_ends_at) {
                    const expiryDate = new Date(userProfile.workflow_subscription_ends_at);
                    if (expiryDate < new Date()) {
                        console.log(`User ${workflow.user_id} subscription expired`);
                        errors.push(`Workflow "${workflow.name}": User subscription expired`);
                        continue;
                    }
                }

                // Get user's connected Telegram account
                const { data: telegramAccount } = await supabase
                    .from('social_media_accounts')
                    .select('extra_data')
                    .eq('user_id', workflow.user_id)
                    .eq('platform', 'telegram')
                    .eq('is_connected', true)
                    .single();

                const chatId = telegramAccount?.extra_data?.chat_id;

                if (!chatId) {
                    console.log(`No Telegram account connected for user ${workflow.user_id}`);
                    errors.push(`Workflow "${workflow.name}": No Telegram account connected`);
                    continue;
                }

                // Create queue entry
                const { data: queueEntry, error: queueError } = await supabase
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
                    })
                    .select()
                    .single();

                if (queueError) {
                    console.error('Error creating queue entry:', queueError);
                    errors.push(`Workflow "${workflow.name}": Failed to create queue entry`);
                    continue;
                }

                console.log(`Created queue entry: ${queueEntry.id}`);

                // Calculate next run time
                const nextRunAt = calculateNextRunTime(schedule);

                // Update schedule
                await supabase
                    .from('automation_schedules')
                    .update({
                        last_run_at: now,
                        next_run_at: nextRunAt,
                    })
                    .eq('id', schedule.id);

                processedCount++;

                // Trigger process-automation function immediately
                try {
                    await supabase.functions.invoke('process-automation', {
                        body: { queue_id: queueEntry.id }
                    });
                } catch (invokeError) {
                    console.error('Error invoking process-automation:', invokeError);
                    // Continue even if invoke fails - the processor can pick it up later
                }

            } catch (err) {
                console.error(`Error processing schedule ${schedule.id}:`, err);
                errors.push(`Schedule ${schedule.id}: ${err.message}`);
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Processed ${processedCount} schedules`,
                processed: processedCount,
                errors: errors.length > 0 ? errors : undefined,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error in run-scheduler:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

function calculateNextRunTime(schedule: AutomationSchedule): string {
    const now = new Date();
    let nextRun: Date;

    if (schedule.schedule_type === 'hourly') {
        // Next hour at the specified minute
        nextRun = new Date(now);
        nextRun.setHours(nextRun.getHours() + 1);
        nextRun.setMinutes(schedule.minute_of_hour || 0);
        nextRun.setSeconds(0);
        nextRun.setMilliseconds(0);
    } else if (schedule.schedule_type === 'daily') {
        // Tomorrow at the specified time
        nextRun = new Date(now);
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(schedule.hour_of_day || 9);
        nextRun.setMinutes(schedule.minute_of_hour || 0);
        nextRun.setSeconds(0);
        nextRun.setMilliseconds(0);
    } else {
        // Default: 1 hour from now
        nextRun = new Date(now.getTime() + 60 * 60 * 1000);
    }

    return nextRun.toISOString();
}
