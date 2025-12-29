-- Migration: Add Referral System
-- Adds referral_code and referred_by columns to profiles table
-- Updates handle_new_user trigger to auto-generate referral codes

-- Add referral columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id);

-- Create index for faster referral lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(8)
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result VARCHAR(8) := '';
  i INTEGER;
  code_exists BOOLEAN := TRUE;
BEGIN
  -- Keep generating until we get a unique code
  WHILE code_exists LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = result) INTO code_exists;
  END LOOP;
  
  RETURN result;
END;
$$;

-- Update handle_new_user function to include referral code generation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_id UUID := NULL;
  ref_code VARCHAR(8);
BEGIN
  -- Check if there's a referrer code in metadata
  IF NEW.raw_user_meta_data ? 'referred_by_code' THEN
    SELECT id INTO referrer_id 
    FROM public.profiles 
    WHERE referral_code = NEW.raw_user_meta_data ->> 'referred_by_code';
  END IF;
  
  -- Generate unique referral code for new user
  ref_code := generate_referral_code();
  
  -- Create profile for new user
  INSERT INTO public.profiles (id, email, username, is_approved, referral_code, referred_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.email = 'azmeerbisnes1@gmail.com' THEN true ELSE false END,
    ref_code,
    referrer_id
  );
  
  -- Assign role (admin for azmeerbisnes1@gmail.com, user for others)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN NEW.email = 'azmeerbisnes1@gmail.com' THEN 'admin'::app_role ELSE 'user'::app_role END
  );
  
  RETURN NEW;
END;
$$;

-- Backfill existing users with referral codes
UPDATE public.profiles 
SET referral_code = generate_referral_code() 
WHERE referral_code IS NULL;
