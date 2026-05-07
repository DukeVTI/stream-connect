-- Create live_call_queue table for managing video call queue
CREATE TABLE IF NOT EXISTS public.live_call_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','accepted','rejected','ended')),
  position_in_queue INTEGER NOT NULL DEFAULT 0,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

ALTER TABLE public.live_call_queue ENABLE ROW LEVEL SECURITY;

-- Everyone can view the queue for a session
CREATE POLICY "Queue is viewable by everyone"
  ON public.live_call_queue FOR SELECT
  USING (true);

-- Users can add themselves to queue
CREATE POLICY "Users can add themselves to queue"
  ON public.live_call_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Creators can manage queue entries
CREATE POLICY "Creators can update queue entries"
  ON public.live_call_queue FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM public.live_sessions WHERE creator_id = auth.uid()
    )
  );

-- Users can delete their own entries
CREATE POLICY "Users can delete their own queue entries"
  ON public.live_call_queue FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_live_call_queue_session ON public.live_call_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_live_call_queue_user ON public.live_call_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_live_call_queue_status ON public.live_call_queue(status);

-- Function to automatically update position_in_queue when status changes
CREATE OR REPLACE FUNCTION public.update_queue_positions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'waiting' OR OLD.status != NEW.status THEN
    -- Recalculate positions for all waiting entries in this session
    WITH ranked_queue AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY requested_at) as new_position
      FROM public.live_call_queue
      WHERE session_id = NEW.session_id AND status = 'waiting'
    )
    UPDATE public.live_call_queue
    SET position_in_queue = ranked_queue.new_position
    FROM ranked_queue
    WHERE live_call_queue.id = ranked_queue.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_queue_positions_trigger ON public.live_call_queue;
CREATE TRIGGER update_queue_positions_trigger
  AFTER INSERT OR UPDATE ON public.live_call_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_queue_positions();

-- RPC function to accept a call from the queue
CREATE OR REPLACE FUNCTION public.accept_call_from_queue(
  _queue_id UUID,
  _session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session_creator_id UUID;
  _is_authorized BOOLEAN;
BEGIN
  -- Check if current user is the stream creator
  SELECT creator_id INTO _session_creator_id
  FROM public.live_sessions
  WHERE id = _session_id;

  IF _session_creator_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF auth.uid() != _session_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: only stream creator can accept calls';
  END IF;

  -- Update the queue entry
  UPDATE public.live_call_queue
  SET status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  WHERE id = _queue_id AND session_id = _session_id;

  RETURN TRUE;
END;
$$;

-- RPC function to reject/end a call
CREATE OR REPLACE FUNCTION public.reject_call_from_queue(
  _queue_id UUID,
  _session_id UUID
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
    RAISE EXCEPTION 'Unauthorized: only stream creator can reject calls';
  END IF;

  -- Update the queue entry
  UPDATE public.live_call_queue
  SET status = 'rejected',
      ended_at = now(),
      updated_at = now()
  WHERE id = _queue_id AND session_id = _session_id;

  RETURN TRUE;
END;
$$;
