
-- Add FK from comments.user_id to profiles.user_id so we can join
ALTER TABLE public.comments
ADD CONSTRAINT comments_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Add FK from likes.user_id to profiles.user_id  
ALTER TABLE public.likes
ADD CONSTRAINT likes_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Add FK from subscriptions.user_id to profiles.user_id
ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Add unique constraint on profiles.user_id for FK references
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
