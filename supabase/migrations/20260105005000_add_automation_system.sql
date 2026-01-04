-- Automation Workflow System Tables
-- Created: 2026-01-05

-- ============================================
-- Table: automation_workflows
-- Stores workflow definitions created by users
-- ============================================
CREATE TABLE IF NOT EXISTS public.automation_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'image', 'both')),
  prompt_template TEXT NOT NULL,
  caption_template TEXT, -- Template for social media caption
  aspect_ratio TEXT DEFAULT 'landscape', -- 'landscape', 'portrait', 'square'
  duration INTEGER DEFAULT 10, -- For video: 5, 10, 15 seconds
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Table: automation_schedules
-- Cron-like schedules for when workflows run
-- ============================================
CREATE TABLE IF NOT EXISTS public.automation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('hourly', 'daily', 'custom')),
  cron_expression TEXT, -- e.g., '0 9 * * *' for 9 AM daily
  hour_of_day INTEGER, -- 0-23, for daily schedules
  minute_of_hour INTEGER DEFAULT 0, -- 0-59
  days_of_week INTEGER[], -- 0-6 (Sun-Sat), null = every day
  timezone TEXT DEFAULT 'Asia/Kuala_Lumpur',
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Table: social_media_accounts
-- Connected social media accounts & tokens
-- ============================================
CREATE TABLE IF NOT EXISTS public.social_media_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'facebook', 'instagram', 'youtube', 'tiktok', 'threads')),
  account_name TEXT,
  account_id TEXT, -- Platform-specific ID (page ID, channel ID, etc.)
  access_token TEXT, -- Encrypted in production
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  extra_data JSONB, -- Platform-specific data (e.g., Telegram chat_id)
  is_connected BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform, account_id)
);

-- ============================================
-- Table: automation_posts_queue
-- Queue of pending posts to be published
-- ============================================
CREATE TABLE IF NOT EXISTS public.automation_posts_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.automation_workflows(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'image')),
  content_url TEXT, -- Generated video/image URL
  prompt_used TEXT, -- Actual prompt used for generation
  caption TEXT, -- Caption to post
  platforms TEXT[] NOT NULL, -- ['telegram', 'facebook', 'instagram']
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'posting', 'completed', 'failed', 'partial')),
  scheduled_for TIMESTAMPTZ,
  generation_started_at TIMESTAMPTZ,
  generation_completed_at TIMESTAMPTZ,
  posting_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Table: automation_post_history
-- Log of all published posts (per platform)
-- ============================================
CREATE TABLE IF NOT EXISTS public.automation_post_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES public.automation_posts_queue(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  post_id TEXT, -- ID returned from the platform
  post_url TEXT, -- URL to view the post
  content_url TEXT, -- The content that was posted
  caption TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  response_data JSONB, -- Full response from platform API
  error_message TEXT,
  posted_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_workflows_user ON public.automation_workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON public.automation_workflows(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_schedules_workflow ON public.automation_schedules(workflow_id);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON public.automation_schedules(next_run_at) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON public.social_media_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON public.social_media_accounts(platform);

CREATE INDEX IF NOT EXISTS idx_posts_queue_status ON public.automation_posts_queue(status);
CREATE INDEX IF NOT EXISTS idx_posts_queue_scheduled ON public.automation_posts_queue(scheduled_for) WHERE status IN ('pending', 'ready');
CREATE INDEX IF NOT EXISTS idx_posts_queue_user ON public.automation_posts_queue(user_id);

CREATE INDEX IF NOT EXISTS idx_post_history_user ON public.automation_post_history(user_id);
CREATE INDEX IF NOT EXISTS idx_post_history_platform ON public.automation_post_history(platform);
CREATE INDEX IF NOT EXISTS idx_post_history_posted ON public.automation_post_history(posted_at);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_media_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_posts_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_post_history ENABLE ROW LEVEL SECURITY;

-- Policies for automation_workflows
CREATE POLICY "Users can view own workflows" ON public.automation_workflows
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own workflows" ON public.automation_workflows
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workflows" ON public.automation_workflows
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workflows" ON public.automation_workflows
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for automation_schedules
CREATE POLICY "Users can view own schedules" ON public.automation_schedules
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.automation_workflows w WHERE w.id = workflow_id AND w.user_id = auth.uid())
  );
CREATE POLICY "Users can create own schedules" ON public.automation_schedules
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.automation_workflows w WHERE w.id = workflow_id AND w.user_id = auth.uid())
  );
CREATE POLICY "Users can update own schedules" ON public.automation_schedules
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.automation_workflows w WHERE w.id = workflow_id AND w.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own schedules" ON public.automation_schedules
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.automation_workflows w WHERE w.id = workflow_id AND w.user_id = auth.uid())
  );

-- Policies for social_media_accounts
CREATE POLICY "Users can view own social accounts" ON public.social_media_accounts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own social accounts" ON public.social_media_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own social accounts" ON public.social_media_accounts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own social accounts" ON public.social_media_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for automation_posts_queue
CREATE POLICY "Users can view own post queue" ON public.automation_posts_queue
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own post queue" ON public.automation_posts_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own post queue" ON public.automation_posts_queue
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own post queue" ON public.automation_posts_queue
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for automation_post_history
CREATE POLICY "Users can view own post history" ON public.automation_post_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own post history" ON public.automation_post_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Service role policies (for edge functions)
-- ============================================
CREATE POLICY "Service role full access workflows" ON public.automation_workflows
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access schedules" ON public.automation_schedules
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access social accounts" ON public.social_media_accounts
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access posts queue" ON public.automation_posts_queue
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access post history" ON public.automation_post_history
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Function to calculate next run time
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_next_run_time(
  p_schedule_type TEXT,
  p_hour_of_day INTEGER,
  p_minute_of_hour INTEGER,
  p_timezone TEXT DEFAULT 'Asia/Kuala_Lumpur'
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
BEGIN
  v_now := now() AT TIME ZONE p_timezone;
  
  IF p_schedule_type = 'hourly' THEN
    -- Next hour at specified minute
    v_next := date_trunc('hour', v_now) + INTERVAL '1 hour' + (p_minute_of_hour || ' minutes')::INTERVAL;
    IF v_next <= v_now THEN
      v_next := v_next + INTERVAL '1 hour';
    END IF;
  ELSIF p_schedule_type = 'daily' THEN
    -- Today or tomorrow at specified time
    v_next := date_trunc('day', v_now) + (p_hour_of_day || ' hours')::INTERVAL + (p_minute_of_hour || ' minutes')::INTERVAL;
    IF v_next <= v_now THEN
      v_next := v_next + INTERVAL '1 day';
    END IF;
  ELSE
    -- Custom: default to 1 hour from now
    v_next := v_now + INTERVAL '1 hour';
  END IF;
  
  RETURN v_next AT TIME ZONE p_timezone;
END;
$$;

-- ============================================
-- Trigger to update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.automation_workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_social_accounts_updated_at
  BEFORE UPDATE ON public.social_media_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_posts_queue_updated_at
  BEFORE UPDATE ON public.automation_posts_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Grant permissions
-- ============================================
GRANT ALL ON public.automation_workflows TO authenticated;
GRANT ALL ON public.automation_schedules TO authenticated;
GRANT ALL ON public.social_media_accounts TO authenticated;
GRANT ALL ON public.automation_posts_queue TO authenticated;
GRANT ALL ON public.automation_post_history TO authenticated;

GRANT ALL ON public.automation_workflows TO service_role;
GRANT ALL ON public.automation_schedules TO service_role;
GRANT ALL ON public.social_media_accounts TO service_role;
GRANT ALL ON public.automation_posts_queue TO service_role;
GRANT ALL ON public.automation_post_history TO service_role;
