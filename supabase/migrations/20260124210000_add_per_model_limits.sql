-- Add per-model video limits to profiles table
-- Each model has its own limit and usage counter

-- Add limit columns for each model (default 0 - must be set by admin)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS sora2_limit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sora2pro_limit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS veo3_limit INTEGER DEFAULT 0;

-- Add usage counters for each model
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS sora2_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sora2pro_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS veo3_used INTEGER DEFAULT 0;

-- Update image_limit default to 0 for new users
ALTER TABLE public.profiles ALTER COLUMN image_limit SET DEFAULT 0;

-- Update video_limit default to 0 for new users (fallback/total limit)
ALTER TABLE public.profiles ALTER COLUMN video_limit SET DEFAULT 0;

-- Update the handle_new_user function to set all limits to 0
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    username, 
    is_approved, 
    video_limit, 
    image_limit,
    sora2_limit,
    sora2pro_limit,
    veo3_limit,
    sora2_used,
    sora2pro_used,
    veo3_used
  )
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'username', 
    false, 
    0,  -- video_limit default 0
    0,  -- image_limit default 0
    0,  -- sora2_limit default 0
    0,  -- sora2pro_limit default 0
    0,  -- veo3_limit default 0
    0,  -- sora2_used default 0
    0,  -- sora2pro_used default 0
    0   -- veo3_used default 0
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_sora2_limit ON public.profiles(sora2_limit);
CREATE INDEX IF NOT EXISTS idx_profiles_sora2pro_limit ON public.profiles(sora2pro_limit);
CREATE INDEX IF NOT EXISTS idx_profiles_veo3_limit ON public.profiles(veo3_limit);
