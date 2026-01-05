-- Add user API keys and product images to automation system
-- Created: 2026-01-05

-- Add openai_api_key to profiles table (encrypted in production)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS openai_api_key TEXT;

-- Add product_image_url to workflows for I2V generation
ALTER TABLE public.automation_workflows 
ADD COLUMN IF NOT EXISTS product_image_url TEXT;

-- Add reference_image_url to posts queue for I2V
ALTER TABLE public.automation_posts_queue 
ADD COLUMN IF NOT EXISTS reference_image_url TEXT;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.openai_api_key IS 'User OpenAI API key for auto-generating prompts (should be encrypted in production)';
COMMENT ON COLUMN public.automation_workflows.product_image_url IS 'Product image URL for Image-to-Video generation';
COMMENT ON COLUMN public.automation_posts_queue.reference_image_url IS 'Reference image URL used for this specific generation';
