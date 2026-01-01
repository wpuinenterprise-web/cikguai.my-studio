-- Verify referral tracking setup
-- Run this in Supabase SQL Editor to check and fix referral system

-- 1. Check if handle_new_user function exists and is correct
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'handle_new_user';

-- 2. Check if users have referral codes
SELECT id, email, referral_code, referred_by, created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 20;

-- 3. Check referral links - who referred who
SELECT 
    p1.email as user_email,
    p1.created_at as user_registered,
    p2.email as referred_by_email,
    p2.referral_code as referrer_code
FROM profiles p1
LEFT JOIN profiles p2 ON p1.referred_by = p2.id
WHERE p1.referred_by IS NOT NULL
ORDER BY p1.created_at DESC;

-- 4. Check if trigger exists on auth.users
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'users' 
AND event_object_schema = 'auth';

-- 5. Re-create the trigger to ensure it's working correctly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Verify the correct handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_id UUID := NULL;
  ref_code VARCHAR(8);
  referred_code_value TEXT;
BEGIN
  -- Get the referral code from metadata
  referred_code_value := NEW.raw_user_meta_data ->> 'referred_by_code';
  
  RAISE NOTICE 'New user registration: %, referred_by_code: %', NEW.email, referred_code_value;
  
  -- Check if there's a referrer code in metadata
  IF referred_code_value IS NOT NULL AND referred_code_value != '' THEN
    SELECT id INTO referrer_id 
    FROM public.profiles 
    WHERE referral_code = referred_code_value;
    
    RAISE NOTICE 'Found referrer_id: % for code: %', referrer_id, referred_code_value;
  END IF;
  
  -- Generate unique referral code for new user
  ref_code := generate_referral_code();
  
  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    -- Update existing profile with referral info if missing
    UPDATE public.profiles 
    SET 
      referred_by = COALESCE(referred_by, referrer_id),
      referral_code = COALESCE(referral_code, ref_code)
    WHERE id = NEW.id AND referred_by IS NULL;
  ELSE
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
  END IF;
  
  -- Assign role if not exists
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (
      NEW.id,
      CASE WHEN NEW.email = 'azmeerbisnes1@gmail.com' THEN 'admin'::app_role ELSE 'user'::app_role END
    );
  END IF;
  
  RETURN NEW;
END;
$$;
