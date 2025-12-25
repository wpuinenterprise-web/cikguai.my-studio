-- Update handle_new_user function to assign admin role for specific email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile for new user
  INSERT INTO public.profiles (id, email, username, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.email = 'azmeerbisnes1@gmail.com' THEN true ELSE false END
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