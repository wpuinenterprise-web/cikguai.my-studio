-- Migration: Add image_generations table for Gemini Image Generator
-- This table stores all generated images separately from video generations

-- Create image_generations table
CREATE TABLE IF NOT EXISTS public.image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prompt TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('t2i', 'i2i', 'merge')),
  aspect_ratio TEXT DEFAULT '1:1' CHECK (aspect_ratio IN ('1:1', '16:9', '9:16')),
  reference_image_url TEXT,
  second_image_url TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS policies
ALTER TABLE public.image_generations ENABLE ROW LEVEL SECURITY;

-- Users can view their own images
CREATE POLICY "Users can view own images" ON public.image_generations
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own images
CREATE POLICY "Users can insert own images" ON public.image_generations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own images
CREATE POLICY "Users can update own images" ON public.image_generations
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own images
CREATE POLICY "Users can delete own images" ON public.image_generations
  FOR DELETE USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX idx_image_generations_user_id ON public.image_generations(user_id);
CREATE INDEX idx_image_generations_created_at ON public.image_generations(created_at DESC);
CREATE INDEX idx_image_generations_status ON public.image_generations(status);

-- Add total_images_generated column to profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS total_images_generated INTEGER DEFAULT 0 NOT NULL;

-- Comment for documentation
COMMENT ON TABLE public.image_generations IS 'Stores all generated images from Gemini Image Generator';
COMMENT ON COLUMN public.image_generations.mode IS 't2i = Text to Image, i2i = Image to Image, merge = Combine 2 images';
