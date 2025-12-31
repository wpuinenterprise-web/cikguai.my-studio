export enum AppView {
  SORA_STUDIO = 'SORA_STUDIO',
  HISTORY = 'HISTORY',
  IMAGE_STUDIO = 'IMAGE_STUDIO',
  IMAGE_HISTORY = 'IMAGE_HISTORY',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
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
