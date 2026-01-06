-- Fix missing columns in automation_workflows and profiles
-- Created: 2026-01-06

-- Add cta_type to automation_workflows (missing from previous migration)
ALTER TABLE public.automation_workflows
ADD COLUMN IF NOT EXISTS cta_type TEXT DEFAULT 'general';

-- Add is_admin to profiles if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN public.automation_workflows.cta_type IS 'CTA type for video prompts: fb, tiktok, or general';
COMMENT ON COLUMN public.profiles.is_admin IS 'Whether the user is an admin';
