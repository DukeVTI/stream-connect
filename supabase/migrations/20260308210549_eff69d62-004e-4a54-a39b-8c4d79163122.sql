
-- Add is_live column to channels
ALTER TABLE public.channels ADD COLUMN is_live boolean NOT NULL DEFAULT false;

-- Create live_sessions table
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'live',
  livekit_room_name text NOT NULL UNIQUE,
  viewer_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live sessions are viewable by everyone" ON public.live_sessions FOR SELECT USING (true);
CREATE POLICY "Creators can insert their own sessions" ON public.live_sessions FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update their own sessions" ON public.live_sessions FOR UPDATE USING (auth.uid() = creator_id);

-- Create live_messages table
CREATE TABLE public.live_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live messages are viewable by everyone" ON public.live_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can send messages" ON public.live_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime for live_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
