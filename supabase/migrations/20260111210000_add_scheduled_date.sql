-- Migration: Add scheduled_date column for one-time scheduled posts
-- This allows users to schedule workflows to run once at a specific date/time

ALTER TABLE public.automation_schedules 
ADD COLUMN IF NOT EXISTS scheduled_date TIMESTAMPTZ;

-- Add comment for clarity
COMMENT ON COLUMN public.automation_schedules.scheduled_date IS 'Exact date/time for one-time (once) schedule type';
