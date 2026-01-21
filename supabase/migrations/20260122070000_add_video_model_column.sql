-- Add model column to video_generations table
ALTER TABLE video_generations 
ADD COLUMN IF NOT EXISTS model TEXT DEFAULT 'sora-2';

-- Add comment for documentation
COMMENT ON COLUMN video_generations.model IS 'Video generation model: sora-2, sora-2-pro, veo-2, veo-3';
