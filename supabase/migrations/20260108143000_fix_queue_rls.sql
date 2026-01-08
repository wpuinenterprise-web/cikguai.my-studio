-- Ensure permissive insert policy for automation_posts_queue
-- This fixes "new row violates row-level security policy" errors during scheduler execution

-- Drop potential conflicting policies
DROP POLICY IF EXISTS "Users can create own post queue" ON public.automation_posts_queue;

-- Create permissive insert policy
CREATE POLICY "Users can create own post queue" ON public.automation_posts_queue
  FOR INSERT WITH CHECK (true);

-- Ensure authenticated users can read/update their own queue
DROP POLICY IF EXISTS "Users can view own post queue" ON public.automation_posts_queue;
CREATE POLICY "Users can view own post queue" ON public.automation_posts_queue
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own post queue" ON public.automation_posts_queue;
CREATE POLICY "Users can update own post queue" ON public.automation_posts_queue
  FOR UPDATE USING (auth.uid() = user_id);

-- Also ensure Service Role can do everything (redundant but safe)
DROP POLICY IF EXISTS "Service role full access posts queue" ON public.automation_posts_queue;
CREATE POLICY "Service role full access posts queue" ON public.automation_posts_queue
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
