-- Update default video_limit to 0 for new users
ALTER TABLE public.profiles ALTER COLUMN video_limit SET DEFAULT 0;

-- Update the handle_new_user function to set video_limit to 0 for non-admin users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create profile for new user (0 limit for regular users)
  INSERT INTO public.profiles (id, email, username, is_approved, video_limit, image_limit)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.email = 'azmeerbisnes1@gmail.com' THEN true ELSE false END,
    CASE WHEN NEW.email = 'azmeerbisnes1@gmail.com' THEN 999 ELSE 0 END,
    CASE WHEN NEW.email = 'azmeerbisnes1@gmail.com' THEN 999 ELSE 0 END
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