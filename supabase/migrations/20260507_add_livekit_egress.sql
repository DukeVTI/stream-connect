-- Create recordings table
CREATE TABLE recordings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'recording', 'processing', 'completed', 'failed', 'paused')),
    recording_url TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    file_size_bytes BIGINT,
    livekit_egress_id TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    paused_at TIMESTAMP WITH TIME ZONE,
    resumed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Ensure unique active recording per session
    CONSTRAINT unique_active_recording UNIQUE (session_id) DEFERRABLE INITIALLY DEFERRED
);

-- Create recording_segments table for tracking pause/resume events
CREATE TABLE recording_segments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    segment_number INTEGER NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    segment_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_recordings_session ON recordings(session_id);
CREATE INDEX idx_recordings_channel ON recordings(channel_id);
CREATE INDEX idx_recordings_status ON recordings(status);
CREATE INDEX idx_recordings_created_at ON recordings(created_at DESC);
CREATE INDEX idx_recording_segments_recording ON recording_segments(recording_id);

-- Enable RLS
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_segments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recordings
CREATE POLICY "Users can view recordings for their channels" ON recordings
    FOR SELECT USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        OR session_id IN (SELECT id FROM live_sessions WHERE creator_id = auth.uid())
    );

CREATE POLICY "Channel owners can create recordings" ON recordings
    FOR INSERT WITH CHECK (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Channel owners can update recordings" ON recordings
    FOR UPDATE USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Channel owners can delete recordings" ON recordings
    FOR DELETE USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

-- RLS Policies for recording_segments
CREATE POLICY "Users can view segments for their recordings" ON recording_segments
    FOR SELECT USING (
        recording_id IN (
            SELECT id FROM recordings WHERE
            channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
            OR session_id IN (SELECT id FROM live_sessions WHERE creator_id = auth.uid())
        )
    );

CREATE POLICY "Channel owners can create recording segments" ON recording_segments
    FOR INSERT WITH CHECK (
        recording_id IN (
            SELECT id FROM recordings WHERE
            channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        )
    );

-- Function to start recording
CREATE OR REPLACE FUNCTION start_recording(
    _session_id UUID,
    _livekit_egress_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    recording_id UUID;
    session_channel_id UUID;
BEGIN
    -- Get channel ID from session
    SELECT channel_id INTO session_channel_id
    FROM live_sessions
    WHERE id = _session_id
    AND creator_id = auth.uid();

    IF session_channel_id IS NULL THEN
        RAISE EXCEPTION 'Session not found or not authorized';
    END IF;

    -- Create recording
    INSERT INTO recordings (session_id, channel_id, status, livekit_egress_id, started_at)
    VALUES (_session_id, session_channel_id, 'recording', _livekit_egress_id, NOW())
    RETURNING id INTO recording_id;

    -- Create initial segment
    INSERT INTO recording_segments (recording_id, segment_number, started_at)
    VALUES (recording_id, 1, NOW());

    RETURN recording_id;
END;
$$;

-- Function to pause recording
CREATE OR REPLACE FUNCTION pause_recording(
    _recording_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate ownership
    IF NOT EXISTS (
        SELECT 1 FROM recordings r
        JOIN channels c ON r.channel_id = c.id
        WHERE r.id = _recording_id
        AND c.owner_id = auth.uid()
        AND r.status = 'recording'
    ) THEN
        RAISE EXCEPTION 'Recording not found or not authorized';
    END IF;

    -- Update recording status
    UPDATE recordings
    SET status = 'paused', paused_at = NOW()
    WHERE id = _recording_id;

    -- End current segment
    UPDATE recording_segments
    SET ended_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
    WHERE recording_id = _recording_id
    AND ended_at IS NULL;
END;
$$;

-- Function to resume recording
CREATE OR REPLACE FUNCTION resume_recording(
    _recording_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    next_segment_number INTEGER;
BEGIN
    -- Validate ownership
    IF NOT EXISTS (
        SELECT 1 FROM recordings r
        JOIN channels c ON r.channel_id = c.id
        WHERE r.id = _recording_id
        AND c.owner_id = auth.uid()
        AND r.status = 'paused'
    ) THEN
        RAISE EXCEPTION 'Recording not found or not authorized';
    END IF;

    -- Update recording status
    UPDATE recordings
    SET status = 'recording', resumed_at = NOW()
    WHERE id = _recording_id;

    -- Get next segment number
    SELECT COALESCE(MAX(segment_number), 0) + 1 INTO next_segment_number
    FROM recording_segments
    WHERE recording_id = _recording_id;

    -- Create new segment
    INSERT INTO recording_segments (recording_id, segment_number, started_at)
    VALUES (_recording_id, next_segment_number, NOW());
END;
$$;

-- Function to stop recording
CREATE OR REPLACE FUNCTION stop_recording(
    _recording_id UUID,
    _recording_url TEXT,
    _thumbnail_url TEXT,
    _duration_seconds INTEGER,
    _file_size_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate ownership
    IF NOT EXISTS (
        SELECT 1 FROM recordings r
        JOIN channels c ON r.channel_id = c.id
        WHERE r.id = _recording_id
        AND c.owner_id = auth.uid()
        AND r.status IN ('recording', 'paused')
    ) THEN
        RAISE EXCEPTION 'Recording not found or not authorized';
    END IF;

    -- End current segment
    UPDATE recording_segments
    SET ended_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
    WHERE recording_id = _recording_id
    AND ended_at IS NULL;

    -- Update recording
    UPDATE recordings
    SET
        status = 'completed',
        recording_url = _recording_url,
        thumbnail_url = _thumbnail_url,
        duration_seconds = _duration_seconds,
        file_size_bytes = _file_size_bytes,
        completed_at = NOW()
    WHERE id = _recording_id;
END;
$$;

-- Function to mark recording as failed
CREATE OR REPLACE FUNCTION mark_recording_failed(
    _recording_id UUID,
    _error_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update recording status
    UPDATE recordings
    SET status = 'failed'
    WHERE id = _recording_id;
END;
$$;

-- Function to get active recording for session
CREATE OR REPLACE FUNCTION get_active_recording(_session_id UUID)
RETURNS TABLE (
    id UUID,
    status TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    paused_at TIMESTAMP WITH TIME ZONE,
    recording_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.status,
        r.started_at,
        r.paused_at,
        r.recording_url
    FROM recordings r
    WHERE r.session_id = _session_id
    AND r.status IN ('recording', 'paused', 'processing');
END;
$$;

-- Function to get recorded sessions for channel
CREATE OR REPLACE FUNCTION get_channel_recordings(_channel_id UUID)
RETURNS TABLE (
    id UUID,
    session_id UUID,
    status TEXT,
    recording_url TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    file_size_bytes BIGINT,
    created_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.session_id,
        r.status,
        r.recording_url,
        r.thumbnail_url,
        r.duration_seconds,
        r.file_size_bytes,
        r.created_at,
        r.completed_at
    FROM recordings r
    WHERE r.channel_id = _channel_id
    AND r.status IN ('completed', 'processing')
    ORDER BY r.created_at DESC;
END;
$$;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_recording_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;