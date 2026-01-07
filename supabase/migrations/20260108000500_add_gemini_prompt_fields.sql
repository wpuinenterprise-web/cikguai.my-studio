-- Migration: Add new workflow fields for Gemini auto prompt system
-- Date: 2026-01-08

-- Add new columns for prompt configuration
ALTER TABLE automation_workflows 
ADD COLUMN IF NOT EXISTS prompt_mode TEXT DEFAULT 'auto' CHECK (prompt_mode IN ('auto', 'manual')),
ADD COLUMN IF NOT EXISTS video_type TEXT DEFAULT 't2v' CHECK (video_type IN ('t2v', 'i2v')),
ADD COLUMN IF NOT EXISTS video_style TEXT DEFAULT 'ugc' CHECK (video_style IN ('ugc', 'storyboard')),
ADD COLUMN IF NOT EXISTS character_gender TEXT DEFAULT 'female' CHECK (character_gender IN ('male', 'female'));

-- Update existing workflows to have default values
UPDATE automation_workflows 
SET 
  prompt_mode = COALESCE(prompt_mode, 'auto'),
  video_type = CASE 
    WHEN product_image_url IS NOT NULL AND product_image_url != '' THEN 'i2v' 
    ELSE 't2v' 
  END,
  video_style = 'ugc',
  character_gender = COALESCE(character_gender, 'female')
WHERE prompt_mode IS NULL OR video_type IS NULL OR video_style IS NULL OR character_gender IS NULL;
