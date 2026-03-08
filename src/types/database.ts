import type { Database } from '@/integrations/supabase/types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Channel = Database['public']['Tables']['channels']['Row'];
export type Content = Database['public']['Tables']['content']['Row'];
export type Comment = Database['public']['Tables']['comments']['Row'];
export type Like = Database['public']['Tables']['likes']['Row'];
export type Subscription = Database['public']['Tables']['subscriptions']['Row'];

// Joined types for common queries
export type ContentWithChannel = Content & {
  channels: Pick<Channel, 'id' | 'name' | 'avatar_url'> | null;
};

export type ContentWithFullChannel = Content & {
  channels: (Channel & { owner_id: string }) | null;
};

export type CommentWithProfile = Comment & {
  profiles: Pick<Profile, 'display_name' | 'avatar_url'> | null;
};
