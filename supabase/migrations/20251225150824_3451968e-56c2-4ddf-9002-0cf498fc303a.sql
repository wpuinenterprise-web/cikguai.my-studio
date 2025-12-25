-- Add geminigen_uuid column to video_generations table for tracking
ALTER TABLE public.video_generations ADD COLUMN geminigen_uuid text;