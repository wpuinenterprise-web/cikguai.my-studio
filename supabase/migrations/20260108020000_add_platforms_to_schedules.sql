-- Add platforms column to automation_schedules for workflow monitoring
ALTER TABLE public.automation_schedules
ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT ARRAY['telegram'];

COMMENT ON COLUMN public.automation_schedules.platforms IS 'Platforms to post to for this workflow schedule';
