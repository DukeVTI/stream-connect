
-- ============================================================
-- BCTV Schema V2 — Full Platform Migration
-- ============================================================

-- Enable pgcrypto for PIN hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. EXTEND PROFILES TABLE
-- ============================================================

ALTER TABLE public.profiles
  -- DOB visibility: partial=show day+month only, private=hidden, public=fully shown
  ADD COLUMN IF NOT EXISTS dob_visibility TEXT NOT NULL DEFAULT 'partial'
    CHECK (dob_visibility IN ('public','partial','private')),
  -- Profile completeness gate
  ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN NOT NULL DEFAULT false,
  -- Required profile fields (photo stored in storage bucket, URL here)
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  -- Account status for admin suspension/deactivation
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active','suspended','deactivated')),
  -- Verification badge type
  ADD COLUMN IF NOT EXISTS verification_badge TEXT NOT NULL DEFAULT 'none'
    CHECK (verification_badge IN ('none','green','blue')),
  -- Shareable public URL slug (defaults to user_id, can be customized)
  ADD COLUMN IF NOT EXISTS profile_handle TEXT UNIQUE;

-- Drop old dob_public boolean (replaced by dob_visibility)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS dob_public;

-- Index for profile_handle lookups
CREATE INDEX IF NOT EXISTS idx_profiles_handle ON public.profiles(profile_handle);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(account_status);

-- Auto-generate profile_handle from user_id on insert if not set
CREATE OR REPLACE FUNCTION public.set_profile_handle()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.profile_handle IS NULL THEN
    NEW.profile_handle := NEW.user_id::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_handle_set ON public.profiles;
CREATE TRIGGER on_profile_handle_set
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_handle();


-- ============================================================
-- 2. EXTEND CHANNELS TABLE
-- ============================================================

ALTER TABLE public.channels
  -- Required channel profile photo
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  -- Hashed PIN for delegated admin access
  ADD COLUMN IF NOT EXISTS channel_pin_hash TEXT,
  -- Livestream eligibility flag
  ADD COLUMN IF NOT EXISTS livestream_eligible BOOLEAN NOT NULL DEFAULT false,
  -- First channel under this account gets free livestream + unlimited uploads
  ADD COLUMN IF NOT EXISTS is_first_channel BOOLEAN NOT NULL DEFAULT false,
  -- Subscription tier for this channel
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free','paid')),
  -- Tracked upload duration (seconds) for storage limit enforcement
  ADD COLUMN IF NOT EXISTS storage_used_seconds INTEGER NOT NULL DEFAULT 0,
  -- Per-channel approve/disapprove feature toggle
  ADD COLUMN IF NOT EXISTS approve_disapprove_enabled BOOLEAN NOT NULL DEFAULT true;

-- Drop old pin_code plaintext column, replaced by channel_pin_hash
ALTER TABLE public.channels DROP COLUMN IF EXISTS pin_code;

CREATE INDEX IF NOT EXISTS idx_channels_owner ON public.channels(owner_id);
CREATE INDEX IF NOT EXISTS idx_channels_handle ON public.channels(handle);


-- ============================================================
-- 3. TRIGGER: First Channel Auto-Flag + Livestream Eligibility
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_channel()
RETURNS TRIGGER AS $$
DECLARE
  _channel_count INTEGER;
BEGIN
  -- Count existing channels for this owner (before this insert)
  SELECT COUNT(*) INTO _channel_count
  FROM public.channels
  WHERE owner_id = NEW.owner_id AND id != NEW.id;

  IF _channel_count = 0 THEN
    NEW.is_first_channel := true;
    NEW.livestream_eligible := true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS on_channel_created ON public.channels;
CREATE TRIGGER on_channel_created
  BEFORE INSERT ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_channel();


-- ============================================================
-- 4. EXTEND CONTENT TABLE
-- ============================================================

ALTER TABLE public.content
  -- Caption is required (distinct from description which is optional)
  ADD COLUMN IF NOT EXISTS caption TEXT,
  -- Approve/disapprove counts (replaces like_count semantics)
  ADD COLUMN IF NOT EXISTS approve_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disapprove_count INTEGER NOT NULL DEFAULT 0,
  -- Per-content approve/disapprove toggle (inherits channel default, can be overridden)
  ADD COLUMN IF NOT EXISTS approve_disapprove_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Flag for PSA Short (duration <= 120s)
  ADD COLUMN IF NOT EXISTS is_psa_short BOOLEAN NOT NULL DEFAULT false;

-- keep like_count for backward compat during transition
-- will be deprecated once frontend is fully migrated


-- ============================================================
-- 5. CONTENT_APPROVALS TABLE (replaces likes)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('approve','disapprove')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(content_id, user_id)
);

ALTER TABLE public.content_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approvals are viewable by everyone"
  ON public.content_approvals FOR SELECT USING (true);
CREATE POLICY "Authenticated users can vote"
  ON public.content_approvals FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can change their vote"
  ON public.content_approvals FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can remove their vote"
  ON public.content_approvals FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_approvals_content ON public.content_approvals(content_id);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON public.content_approvals(user_id);


-- ============================================================
-- 6. RPCS: APPROVE / DISAPPROVE VOTE HANDLING
-- ============================================================

-- Cast or change a vote. Handles insert/update/delete atomically.
CREATE OR REPLACE FUNCTION public.cast_vote(
  _content_id UUID,
  _vote TEXT  -- 'approve' | 'disapprove' | 'none' (none = remove vote)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _existing_vote TEXT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _vote NOT IN ('approve','disapprove','none') THEN
    RAISE EXCEPTION 'Invalid vote value';
  END IF;

  SELECT vote INTO _existing_vote
  FROM public.content_approvals
  WHERE content_id = _content_id AND user_id = _user_id;

  -- Remove existing vote counters
  IF _existing_vote = 'approve' THEN
    UPDATE public.content SET approve_count = GREATEST(approve_count - 1, 0) WHERE id = _content_id;
  ELSIF _existing_vote = 'disapprove' THEN
    UPDATE public.content SET disapprove_count = GREATEST(disapprove_count - 1, 0) WHERE id = _content_id;
  END IF;

  -- Delete old record
  DELETE FROM public.content_approvals WHERE content_id = _content_id AND user_id = _user_id;

  -- Insert new vote if not 'none'
  IF _vote != 'none' THEN
    INSERT INTO public.content_approvals(content_id, user_id, vote)
    VALUES (_content_id, _user_id, _vote);

    IF _vote = 'approve' THEN
      UPDATE public.content SET approve_count = approve_count + 1 WHERE id = _content_id;
    ELSE
      UPDATE public.content SET disapprove_count = disapprove_count + 1 WHERE id = _content_id;
    END IF;
  END IF;
END;
$$;


-- ============================================================
-- 7. PSA SHORTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.psa_shorts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER CHECK (duration_seconds <= 120),
  view_count INTEGER NOT NULL DEFAULT 0,
  approve_count INTEGER NOT NULL DEFAULT 0,
  disapprove_count INTEGER NOT NULL DEFAULT 0,
  approve_disapprove_enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','unlisted')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.psa_shorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published PSA shorts are viewable by everyone"
  ON public.psa_shorts FOR SELECT
  USING (status = 'published' OR auth.uid() = creator_id);
CREATE POLICY "Creators can insert PSA shorts"
  ON public.psa_shorts FOR INSERT
  WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update their PSA shorts"
  ON public.psa_shorts FOR UPDATE
  USING (auth.uid() = creator_id);
CREATE POLICY "Creators can delete their PSA shorts"
  ON public.psa_shorts FOR DELETE
  USING (auth.uid() = creator_id);

CREATE TRIGGER update_psa_shorts_updated_at
  BEFORE UPDATE ON public.psa_shorts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_psa_shorts_channel ON public.psa_shorts(channel_id);
CREATE INDEX IF NOT EXISTS idx_psa_shorts_creator ON public.psa_shorts(creator_id);


-- ============================================================
-- 8. ACCOUNT_ADMINS TABLE (delegated co-managers)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('manager','editor','viewer')),
  -- Array of channel IDs this admin can manage (empty = all channels)
  channel_permissions UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
  invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Max 3 admins per account
  UNIQUE(account_owner_id, email)
);

ALTER TABLE public.account_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owner can manage their admins"
  ON public.account_admins FOR ALL
  USING (auth.uid() = account_owner_id)
  WITH CHECK (auth.uid() = account_owner_id);

CREATE POLICY "Assigned admin can view their own assignment"
  ON public.account_admins FOR SELECT
  USING (assigned_user_id = auth.uid());

CREATE TRIGGER update_account_admins_updated_at
  BEFORE UPDATE ON public.account_admins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_account_admins_owner ON public.account_admins(account_owner_id);
CREATE INDEX IF NOT EXISTS idx_account_admins_assigned ON public.account_admins(assigned_user_id);

-- Enforce max 3 admins per account
CREATE OR REPLACE FUNCTION public.enforce_max_admins()
RETURNS TRIGGER AS $$
DECLARE
  _count INTEGER;
BEGIN
  SELECT COUNT(*) INTO _count
  FROM public.account_admins
  WHERE account_owner_id = NEW.account_owner_id
    AND status != 'revoked'
    AND id != COALESCE(NEW.id, gen_random_uuid());

  IF _count >= 3 THEN
    RAISE EXCEPTION 'Maximum of 3 account administrators allowed per account';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS enforce_max_admins_trigger ON public.account_admins;
CREATE TRIGGER enforce_max_admins_trigger
  BEFORE INSERT ON public.account_admins
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_admins();


-- ============================================================
-- 9. SUBSCRIPTION_PLANS TABLE (channel-level paid subscriptions)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'basic' CHECK (plan_type IN ('basic','premium')),
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Channel owners can view their plans"
  ON public.subscription_plans FOR SELECT
  USING (
    channel_id IN (SELECT id FROM public.channels WHERE owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can manage plans"
  ON public.subscription_plans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_sub_plans_channel ON public.subscription_plans(channel_id);


-- ============================================================
-- 10. SUBSCRIBER_LOCATIONS TABLE (aggregate location analytics)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriber_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code TEXT,
  country_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.subscriber_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Channel owner can view subscriber locations"
  ON public.subscriber_locations FOR SELECT
  USING (
    channel_id IN (SELECT id FROM public.channels WHERE owner_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_sub_locations_channel ON public.subscriber_locations(channel_id);


-- ============================================================
-- 11. CONTENT_REPORTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(content_id, reporter_id)
);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters can view their own reports"
  ON public.content_reports FOR SELECT
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can report content"
  ON public.content_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins can update reports"
  ON public.content_reports FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_reports_content ON public.content_reports(content_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.content_reports(status);


-- ============================================================
-- 12. CHANNEL PIN RPCs (set & verify via pgcrypto)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_channel_pin(_channel_id UUID, _plain_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only channel owner or account admin can set PIN
  IF NOT EXISTS (
    SELECT 1 FROM public.channels WHERE id = _channel_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: only channel owner can set PIN';
  END IF;

  IF length(_plain_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 characters';
  END IF;

  UPDATE public.channels
  SET channel_pin_hash = crypt(_plain_pin, gen_salt('bf'))
  WHERE id = _channel_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_channel_pin(_channel_id UUID, _plain_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash TEXT;
BEGIN
  SELECT channel_pin_hash INTO _hash
  FROM public.channels WHERE id = _channel_id;

  IF _hash IS NULL THEN
    RETURN true; -- No PIN set, access granted
  END IF;

  RETURN (crypt(_plain_pin, _hash) = _hash);
END;
$$;


-- ============================================================
-- 13. ADMIN RPCs: ACCOUNT STATUS & BADGE MANAGEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  _user_id UUID,
  _status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  IF _status NOT IN ('active','suspended','deactivated') THEN
    RAISE EXCEPTION 'Invalid status value';
  END IF;

  UPDATE public.profiles
  SET account_status = _status, updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_verification_badge(
  _user_id UUID,
  _badge TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  IF _badge NOT IN ('none','green','blue') THEN
    RAISE EXCEPTION 'Invalid badge value';
  END IF;

  UPDATE public.profiles
  SET verification_badge = _badge, updated_at = now()
  WHERE user_id = _user_id;
END;
$$;


-- ============================================================
-- 14. UPDATED handle_new_user: sets profile_complete = false
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, first_name, last_name, profile_complete)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 15. STORAGE BUCKET: channel-photos
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('channel-photos', 'channel-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read channel-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'channel-photos');

CREATE POLICY "Auth users upload channel-photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'channel-photos');

CREATE POLICY "Auth users update channel-photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'channel-photos');

CREATE POLICY "Auth users delete channel-photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'channel-photos');


-- ============================================================
-- 16. CHANNEL SUBSCRIPTION FEED VIEW (for subscriber feed page)
-- ============================================================

CREATE OR REPLACE VIEW public.subscribed_channel_content AS
SELECT
  c.*,
  ch.name AS channel_name,
  ch.avatar_url AS channel_avatar_url,
  ch.handle AS channel_handle,
  ch.verification_badge AS channel_badge
FROM public.content c
JOIN public.channels ch ON c.channel_id = ch.id
WHERE c.status = 'published';
-- RLS on content table still applies; this is a convenience view


-- ============================================================
-- 17. FULL TEXT SEARCH INDEXES
-- ============================================================

-- For searching channels by name, category
CREATE INDEX IF NOT EXISTS idx_channels_name_fts
  ON public.channels USING gin(to_tsvector('english', name));

-- For searching content by title
CREATE INDEX IF NOT EXISTS idx_content_title_fts
  ON public.content USING gin(to_tsvector('english', title));

-- For searching profiles by display_name / first_name / last_name
CREATE INDEX IF NOT EXISTS idx_profiles_name_fts
  ON public.profiles USING gin(
    to_tsvector('english', coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(display_name,''))
  );
