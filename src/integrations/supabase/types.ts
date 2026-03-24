export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          display_name: string | null;
          first_name: string | null;
          last_name: string | null;
          nickname: string | null;
          date_of_birth: string | null;
          dob_visibility: 'public' | 'partial' | 'private';
          profile_photo_url: string | null;
          avatar_url: string | null;
          bio: string | null;
          hobbies: string[] | null;
          profile_handle: string | null;
          profile_complete: boolean;
          is_creator: boolean;
          account_status: 'active' | 'suspended' | 'deactivated';
          verification_badge: 'none' | 'green' | 'blue';
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      channels: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          handle: string | null;
          category: string | null;
          languages: string[];
          avatar_url: string | null;
          banner_url: string | null;
          profile_photo_url: string | null;
          channel_pin_hash: string | null;
          livestream_eligible: boolean;
          is_first_channel: boolean;
          subscription_tier: 'free' | 'paid';
          storage_used_seconds: number;
          approve_disapprove_enabled: boolean;
          subscriber_count: number;
          is_live: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<Database['public']['Tables']['channels']['Row'], 'owner_id' | 'name'> &
          Partial<Database['public']['Tables']['channels']['Row']>;
        Update: Partial<Database['public']['Tables']['channels']['Row']>;
      };
      content: {
        Row: {
          id: string;
          channel_id: string;
          creator_id: string;
          title: string;
          caption: string | null;
          description: string | null;
          content_type: 'video' | 'audio';
          file_url: string | null;
          thumbnail_url: string | null;
          duration: number | null;
          view_count: number;
          like_count: number;
          approve_count: number;
          disapprove_count: number;
          approve_disapprove_enabled: boolean;
          is_psa_short: boolean;
          status: 'draft' | 'published' | 'unlisted';
          category: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<Database['public']['Tables']['content']['Row'], 'channel_id' | 'creator_id' | 'title' | 'content_type'> &
          Partial<Database['public']['Tables']['content']['Row']>;
        Update: Partial<Database['public']['Tables']['content']['Row']>;
      };
      content_approvals: {
        Row: {
          id: string;
          content_id: string;
          user_id: string;
          vote: 'approve' | 'disapprove';
          created_at: string;
        };
        Insert: { content_id: string; user_id: string; vote: 'approve' | 'disapprove' };
        Update: { vote: 'approve' | 'disapprove' };
      };
      psa_shorts: {
        Row: {
          id: string;
          channel_id: string;
          creator_id: string;
          title: string;
          caption: string;
          description: string | null;
          file_url: string | null;
          thumbnail_url: string | null;
          duration_seconds: number | null;
          view_count: number;
          approve_count: number;
          disapprove_count: number;
          approve_disapprove_enabled: boolean;
          status: 'draft' | 'published' | 'unlisted';
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<Database['public']['Tables']['psa_shorts']['Row'], 'channel_id' | 'creator_id' | 'title' | 'caption'> &
          Partial<Database['public']['Tables']['psa_shorts']['Row']>;
        Update: Partial<Database['public']['Tables']['psa_shorts']['Row']>;
      };
      account_admins: {
        Row: {
          id: string;
          account_owner_id: string;
          assigned_user_id: string | null;
          first_name: string;
          last_name: string;
          email: string;
          role: 'manager' | 'editor' | 'viewer';
          channel_permissions: string[];
          status: 'pending' | 'active' | 'revoked';
          invited_at: string;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<Database['public']['Tables']['account_admins']['Row'], 'account_owner_id' | 'first_name' | 'last_name' | 'email'> &
          Partial<Database['public']['Tables']['account_admins']['Row']>;
        Update: Partial<Database['public']['Tables']['account_admins']['Row']>;
      };
      subscription_plans: {
        Row: {
          id: string;
          channel_id: string;
          plan_type: 'basic' | 'premium';
          starts_at: string;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['subscription_plans']['Row'], 'channel_id'> &
          Partial<Database['public']['Tables']['subscription_plans']['Row']>;
        Update: Partial<Database['public']['Tables']['subscription_plans']['Row']>;
      };
      subscriber_locations: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          country_code: string | null;
          country_name: string | null;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['subscriber_locations']['Row'], 'channel_id' | 'user_id'> &
          Partial<Database['public']['Tables']['subscriber_locations']['Row']>;
        Update: Partial<Database['public']['Tables']['subscriber_locations']['Row']>;
      };
      content_reports: {
        Row: {
          id: string;
          content_id: string;
          reporter_id: string;
          reason: string;
          status: 'open' | 'reviewed' | 'dismissed';
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['content_reports']['Row'], 'content_id' | 'reporter_id' | 'reason'> &
          Partial<Database['public']['Tables']['content_reports']['Row']>;
        Update: Partial<Database['public']['Tables']['content_reports']['Row']>;
      };
      comments: {
        Row: {
          id: string;
          content_id: string;
          user_id: string;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<Database['public']['Tables']['comments']['Row'], 'content_id' | 'user_id' | 'body'>;
        Update: Partial<Database['public']['Tables']['comments']['Row']>;
      };
      subscriptions: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['subscriptions']['Row'], 'channel_id' | 'user_id'>;
        Update: Partial<Database['public']['Tables']['subscriptions']['Row']>;
      };
      creator_requests: {
        Row: {
          id: string;
          user_id: string;
          status: 'pending' | 'approved' | 'rejected';
          reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<Database['public']['Tables']['creator_requests']['Row'], 'user_id'> &
          Partial<Database['public']['Tables']['creator_requests']['Row']>;
        Update: Partial<Database['public']['Tables']['creator_requests']['Row']>;
      };
      live_sessions: {
        Row: {
          id: string;
          channel_id: string;
          creator_id: string;
          title: string;
          status: string;
          livekit_room_name: string;
          viewer_count: number;
          started_at: string;
          ended_at: string | null;
        };
        Insert: Pick<Database['public']['Tables']['live_sessions']['Row'], 'channel_id' | 'creator_id' | 'title' | 'livekit_room_name'> &
          Partial<Database['public']['Tables']['live_sessions']['Row']>;
        Update: Partial<Database['public']['Tables']['live_sessions']['Row']>;
      };
      live_messages: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          body: string;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['live_messages']['Row'], 'session_id' | 'user_id' | 'body'>;
        Update: Partial<Database['public']['Tables']['live_messages']['Row']>;
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: 'admin' | 'moderator' | 'user';
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['user_roles']['Row'], 'user_id' | 'role'>;
        Update: Partial<Database['public']['Tables']['user_roles']['Row']>;
      };
    };
    Functions: {
      has_role: { Args: { _user_id: string; _role: string }; Returns: boolean };
      review_creator_request: { Args: { _request_id: string; _decision: string }; Returns: void };
      increment_view_count: { Args: { _content_id: string }; Returns: void };
      increment_like_count: { Args: { _content_id: string }; Returns: void };
      decrement_like_count: { Args: { _content_id: string }; Returns: void };
      cast_vote: { Args: { _content_id: string; _vote: string }; Returns: void };
      set_channel_pin: { Args: { _channel_id: string; _plain_pin: string }; Returns: void };
      verify_channel_pin: { Args: { _channel_id: string; _plain_pin: string }; Returns: boolean };
      admin_set_account_status: { Args: { _user_id: string; _status: string }; Returns: void };
      admin_set_verification_badge: { Args: { _user_id: string; _badge: string }; Returns: void };
    };
    Enums: {
      app_role: 'admin' | 'moderator' | 'user';
    };
  };
};
