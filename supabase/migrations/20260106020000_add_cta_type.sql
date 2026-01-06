-- Add cta_type to automation_workflows for platform-specific CTAs
-- Created: 2026-01-06

ALTER TABLE public.automation_workflows
ADD COLUMN IF NOT EXISTS cta_type TEXT DEFAULT 'general';

COMMENT ON COLUMN public.automation_workflows.cta_type IS 'CTA type for video prompts: fb, tiktok, or general';
