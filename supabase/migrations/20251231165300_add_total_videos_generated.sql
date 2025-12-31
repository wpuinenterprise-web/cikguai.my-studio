-- Migration: Add total_videos_generated column
-- This column tracks the total number of videos generated since registration (never reset)

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS total_videos_generated INTEGER DEFAULT 0 NOT NULL;

-- Initialize total_videos_generated with current videos_used for existing users
UPDATE public.profiles 
SET total_videos_generated = videos_used 
WHERE total_videos_generated = 0;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.total_videos_generated IS 'Total videos generated since registration (never reset)';
