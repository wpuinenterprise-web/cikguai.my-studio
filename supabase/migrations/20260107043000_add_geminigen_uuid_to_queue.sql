-- Add geminigen_uuid to automation_posts_queue for async video polling
ALTER TABLE public.automation_posts_queue 
ADD COLUMN IF NOT EXISTS geminigen_uuid TEXT;

-- Add index for faster lookups of generating items
CREATE INDEX IF NOT EXISTS idx_posts_queue_geminigen_uuid 
ON public.automation_posts_queue(geminigen_uuid) 
WHERE geminigen_uuid IS NOT NULL;

-- Add index for status + geminigen_uuid combo for polling
CREATE INDEX IF NOT EXISTS idx_posts_queue_generating 
ON public.automation_posts_queue(status, generation_started_at) 
WHERE status = 'generating';

COMMENT ON COLUMN public.automation_posts_queue.geminigen_uuid IS 'GeminiGen API UUID for tracking video generation status';
