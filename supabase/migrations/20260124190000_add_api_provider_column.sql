-- Add api_provider column to video_generations table
-- This tracks which API provider was used (geminigen or poyo)
ALTER TABLE video_generations 
ADD COLUMN IF NOT EXISTS api_provider TEXT DEFAULT 'geminigen';

-- Add poyo_task_id column for Poyo.ai task tracking
ALTER TABLE video_generations 
ADD COLUMN IF NOT EXISTS poyo_task_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_video_generations_poyo_task_id 
ON video_generations(poyo_task_id) WHERE poyo_task_id IS NOT NULL;
