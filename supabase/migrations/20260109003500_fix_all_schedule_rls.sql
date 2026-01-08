-- Fix RLS policies for automation_schedules to allow users to read their own schedules
-- This fixes the issue where schedule data doesn't load when editing a workflow

-- Drop and recreate SELECT policy to be more permissive
DROP POLICY IF EXISTS "Users can view own schedules" ON public.automation_schedules;

-- Allow users to view schedules for their own workflows
CREATE POLICY "Users can view own schedules" ON public.automation_schedules
  FOR SELECT USING (
    workflow_id IN (SELECT id FROM public.automation_workflows WHERE user_id = auth.uid())
  );

-- Drop and recreate UPDATE policy
DROP POLICY IF EXISTS "Users can update own schedules" ON public.automation_schedules;

CREATE POLICY "Users can update own schedules" ON public.automation_schedules
  FOR UPDATE USING (
    workflow_id IN (SELECT id FROM public.automation_workflows WHERE user_id = auth.uid())
  );

-- Ensure INSERT is permissive (already should be, but ensure it)
DROP POLICY IF EXISTS "Users can create own schedules" ON public.automation_schedules;

CREATE POLICY "Users can create own schedules" ON public.automation_schedules
  FOR INSERT WITH CHECK (true);

-- Service role policies (for edge functions)
DROP POLICY IF EXISTS "Service role full access schedules" ON public.automation_schedules;
DROP POLICY IF EXISTS "Service role full access to schedules" ON public.automation_schedules;

CREATE POLICY "Service role full access schedules" ON public.automation_schedules
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
