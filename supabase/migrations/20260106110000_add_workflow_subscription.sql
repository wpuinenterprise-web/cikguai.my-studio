-- Workflow Subscription System
-- Created: 2026-01-06
-- Purpose: Add subscription fields for workflow automation access control

-- Add workflow subscription fields to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS workflow_access_approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS workflow_subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS workflow_subscription_days INTEGER DEFAULT 30;

-- Create index for faster subscription checks
CREATE INDEX IF NOT EXISTS idx_profiles_workflow_subscription 
ON public.profiles(workflow_access_approved, workflow_subscription_ends_at);

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.workflow_access_approved 
  IS 'Admin has approved user for workflow automation access';
COMMENT ON COLUMN public.profiles.workflow_subscription_ends_at 
  IS 'Subscription end date - after this date, user cannot use workflows';
COMMENT ON COLUMN public.profiles.workflow_subscription_days 
  IS 'Number of days for subscription period (admin can edit, default 30)';
