-- Add caption and description columns to live_sessions table
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Make caption required going forward by removing the default
ALTER TABLE public.live_sessions
  ALTER COLUMN caption DROP DEFAULT,
  ALTER COLUMN caption SET NOT NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_live_sessions_channel ON public.live_sessions(channel_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_creator ON public.live_sessions(creator_id);
