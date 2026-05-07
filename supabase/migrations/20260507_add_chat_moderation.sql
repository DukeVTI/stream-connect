-- Add chat moderation columns to live_sessions table
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS chat_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_locked_at TIMESTAMP WITH TIME ZONE;

-- Create live_message_flags table for blocking/pinning messages
CREATE TABLE IF NOT EXISTS public.live_message_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.live_messages(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN ('pinned','hidden','blocked')),
  flagged_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  flagged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, flag_type)
);

ALTER TABLE public.live_message_flags ENABLE ROW LEVEL SECURITY;

-- Creator can view and manage message flags
CREATE POLICY "Creators can view message flags for their sessions"
  ON public.live_message_flags FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.live_sessions WHERE creator_id = auth.uid()
    )
  );

-- Creators can manage message flags
CREATE POLICY "Creators can manage message flags"
  ON public.live_message_flags FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.live_sessions WHERE creator_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.live_sessions WHERE creator_id = auth.uid()
    )
  );

-- Create blocked_users table for temporary mutes during livestream
CREATE TABLE IF NOT EXISTS public.live_blocked_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  blocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unblocked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, blocked_user_id)
);

ALTER TABLE public.live_blocked_users ENABLE ROW LEVEL SECURITY;

-- Creators can view and manage blocked users
CREATE POLICY "Creators can view blocked users"
  ON public.live_blocked_users FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.live_sessions WHERE creator_id = auth.uid()
    )
  );

-- Creators can block/unblock users
CREATE POLICY "Creators can manage blocked users"
  ON public.live_blocked_users FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.live_sessions WHERE creator_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.live_sessions WHERE creator_id = auth.uid()
    )
  );

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_live_message_flags_session ON public.live_message_flags(session_id);
CREATE INDEX IF NOT EXISTS idx_live_message_flags_message ON public.live_message_flags(message_id);
CREATE INDEX IF NOT EXISTS idx_live_blocked_users_session ON public.live_blocked_users(session_id);
CREATE INDEX IF NOT EXISTS idx_live_blocked_users_blocked ON public.live_blocked_users(blocked_user_id);

-- RPC function to toggle chat lock
CREATE OR REPLACE FUNCTION public.toggle_chat_lock(
  _session_id UUID,
  _locked BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session_creator_id UUID;
BEGIN
  -- Check if current user is the stream creator
  SELECT creator_id INTO _session_creator_id
  FROM public.live_sessions
  WHERE id = _session_id;

  IF _session_creator_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF auth.uid() != _session_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: only stream creator can toggle chat lock';
  END IF;

  -- Update chat lock status
  UPDATE public.live_sessions
  SET chat_locked = _locked,
      chat_locked_at = CASE WHEN _locked THEN now() ELSE NULL END
  WHERE id = _session_id;

  RETURN TRUE;
END;
$$;

-- RPC function to block/mute a user
CREATE OR REPLACE FUNCTION public.block_user_from_chat(
  _session_id UUID,
  _blocked_user_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session_creator_id UUID;
BEGIN
  -- Check if current user is the stream creator
  SELECT creator_id INTO _session_creator_id
  FROM public.live_sessions
  WHERE id = _session_id;

  IF _session_creator_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF auth.uid() != _session_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: only stream creator can block users';
  END IF;

  -- Insert block record
  INSERT INTO public.live_blocked_users(session_id, blocked_user_id, blocked_by, reason)
  VALUES(_session_id, _blocked_user_id, auth.uid(), _reason)
  ON CONFLICT (session_id, blocked_user_id) DO UPDATE
  SET unblocked_at = NULL, reason = EXCLUDED.reason;

  RETURN TRUE;
END;
$$;

-- RPC function to unblock a user
CREATE OR REPLACE FUNCTION public.unblock_user_from_chat(
  _session_id UUID,
  _blocked_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session_creator_id UUID;
BEGIN
  -- Check if current user is the stream creator
  SELECT creator_id INTO _session_creator_id
  FROM public.live_sessions
  WHERE id = _session_id;

  IF _session_creator_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF auth.uid() != _session_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: only stream creator can unblock users';
  END IF;

  -- Mark as unblocked
  UPDATE public.live_blocked_users
  SET unblocked_at = now()
  WHERE session_id = _session_id AND blocked_user_id = _blocked_user_id AND unblocked_at IS NULL;

  RETURN TRUE;
END;
$$;

-- RPC function to pin/unpin a message
CREATE OR REPLACE FUNCTION public.pin_message(
  _message_id UUID,
  _session_id UUID,
  _pin BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session_creator_id UUID;
BEGIN
  -- Check if current user is the stream creator
  SELECT creator_id INTO _session_creator_id
  FROM public.live_sessions
  WHERE id = _session_id;

  IF _session_creator_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF auth.uid() != _session_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: only stream creator can pin messages';
  END IF;

  IF _pin THEN
    INSERT INTO public.live_message_flags(message_id, session_id, flag_type, flagged_by)
    VALUES(_message_id, _session_id, 'pinned', auth.uid())
    ON CONFLICT (message_id, flag_type) DO NOTHING;
  ELSE
    DELETE FROM public.live_message_flags
    WHERE message_id = _message_id AND session_id = _session_id AND flag_type = 'pinned';
  END IF;

  RETURN TRUE;
END;
$$;
