export enum AppView {
  SORA_STUDIO = 'SORA_STUDIO',
  HISTORY = 'HISTORY',
  IMAGE_STUDIO = 'IMAGE_STUDIO',
  IMAGE_HISTORY = 'IMAGE_HISTORY',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  AUTOMATION = 'AUTOMATION',
  AUTH = 'AUTH'
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar_url?: string;
  is_approved: boolean;
  is_admin: boolean;
  videos_used: number;
  images_used: number;
  video_limit: number;
  image_limit: number;
  referral_code?: string;
  referred_by?: string;
  created_at?: string;
}

export interface GeneratedVideo {
  id: string;
  uuid: string;
  video_url: string;
  thumbnail_url: string;
  prompt: string;
  duration: number;
  aspect_ratio: string;
  status: 'processing' | 'completed' | 'failed';
  created_at: string;
}

export interface SoraHistoryItem {
  id: string;
  uuid: string;
  prompt: string;
  type: 'video' | 'image';
  status: 'processing' | 'completed' | 'failed';
  status_percentage: number;
  thumbnail_url: string | null;
  video_url: string | null;
  created_at: string;
  generated_video?: GeneratedVideo;
}

// ============================================
// Automation System Types
// ============================================

export type ContentType = 'video' | 'image' | 'both';
export type ScheduleType = 'hourly' | 'daily' | 'custom';
export type SocialPlatform = 'telegram' | 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'threads';
export type PostStatus = 'pending' | 'generating' | 'ready' | 'posting' | 'completed' | 'failed' | 'partial';

export interface AutomationWorkflow {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  content_type: ContentType;
  prompt_template: string;
  caption_template?: string;
  aspect_ratio: string;
  duration: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutomationSchedule {
  id: string;
  workflow_id: string;
  schedule_type: ScheduleType;
  cron_expression?: string;
  hour_of_day?: number;
  minute_of_hour: number;
  days_of_week?: number[];
  timezone: string;
  next_run_at?: string;
  last_run_at?: string;
  is_active: boolean;
  created_at: string;
}

export interface SocialMediaAccount {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  account_name?: string;
  account_id?: string;
  is_connected: boolean;
  extra_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AutomationPostQueue {
  id: string;
  workflow_id?: string;
  user_id: string;
  content_type: 'video' | 'image';
  content_url?: string;
  prompt_used?: string;
  caption?: string;
  platforms: SocialPlatform[];
  status: PostStatus;
  scheduled_for?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationPostHistory {
  id: string;
  queue_id?: string;
  user_id: string;
  platform: SocialPlatform;
  post_id?: string;
  post_url?: string;
  content_url?: string;
  caption?: string;
  status: 'success' | 'failed';
  error_message?: string;
  posted_at: string;
}

