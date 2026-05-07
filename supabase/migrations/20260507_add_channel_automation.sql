-- Create automation_playlists table
CREATE TABLE automation_playlists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT false,
    loop_enabled BOOLEAN DEFAULT true,
    shuffle_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create automation_playlist_items table for storing content in playlists
CREATE TABLE automation_playlist_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    playlist_id UUID NOT NULL REFERENCES automation_playlists(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure unique position per playlist
    CONSTRAINT unique_position_per_playlist UNIQUE (playlist_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- Create automation_schedules table
CREATE TABLE automation_schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    playlist_id UUID NOT NULL REFERENCES automation_playlists(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('always_offline', 'scheduled', 'manual')),
    is_enabled BOOLEAN DEFAULT true,
    
    -- Scheduled automation
    start_hour INTEGER CHECK (start_hour >= 0 AND start_hour < 24),
    start_minute INTEGER CHECK (start_minute >= 0 AND start_minute < 60),
    end_hour INTEGER CHECK (end_hour >= 0 AND end_hour < 24),
    end_minute INTEGER CHECK (end_minute >= 0 AND end_minute < 60),
    days_of_week INTEGER[], -- 0-6 (Sunday-Saturday)
    timezone TEXT DEFAULT 'UTC',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure only one 'always_offline' schedule per channel
    CONSTRAINT one_always_offline_per_channel UNIQUE (channel_id, trigger_type) 
        WHERE trigger_type = 'always_offline' DEFERRABLE INITIALLY DEFERRED
);

-- Create automation_sessions table to track active automations
CREATE TABLE automation_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES automation_schedules(id) ON DELETE CASCADE,
    playlist_id UUID NOT NULL REFERENCES automation_playlists(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
    livekit_room_name TEXT,
    livekit_egress_id TEXT,
    current_item_id UUID REFERENCES automation_playlist_items(id),
    current_item_number INTEGER,
    total_items INTEGER,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create automation_logs table for audit trail
CREATE TABLE automation_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    session_id UUID REFERENCES automation_sessions(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('started', 'paused', 'resumed', 'stopped', 'item_changed', 'error')),
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_automation_playlists_channel ON automation_playlists(channel_id);
CREATE INDEX idx_automation_playlists_active ON automation_playlists(is_active);
CREATE INDEX idx_automation_playlist_items_playlist ON automation_playlist_items(playlist_id);
CREATE INDEX idx_automation_schedules_channel ON automation_schedules(channel_id);
CREATE INDEX idx_automation_schedules_enabled ON automation_schedules(is_enabled);
CREATE INDEX idx_automation_sessions_channel ON automation_sessions(channel_id);
CREATE INDEX idx_automation_sessions_status ON automation_sessions(status);
CREATE INDEX idx_automation_logs_channel ON automation_logs(channel_id);
CREATE INDEX idx_automation_logs_created ON automation_logs(created_at DESC);

-- Enable RLS
ALTER TABLE automation_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for automation_playlists
CREATE POLICY "Users can view their channel playlists" ON automation_playlists
    FOR SELECT USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can create playlists for their channels" ON automation_playlists
    FOR INSERT WITH CHECK (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can update their playlists" ON automation_playlists
    FOR UPDATE USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can delete their playlists" ON automation_playlists
    FOR DELETE USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

-- RLS Policies for automation_playlist_items
CREATE POLICY "Users can view their playlist items" ON automation_playlist_items
    FOR SELECT USING (
        playlist_id IN (
            SELECT id FROM automation_playlists WHERE
            channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        )
    );

CREATE POLICY "Users can add items to their playlists" ON automation_playlist_items
    FOR INSERT WITH CHECK (
        playlist_id IN (
            SELECT id FROM automation_playlists WHERE
            channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        )
    );

CREATE POLICY "Users can update their playlist items" ON automation_playlist_items
    FOR UPDATE USING (
        playlist_id IN (
            SELECT id FROM automation_playlists WHERE
            channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        )
    );

CREATE POLICY "Users can delete their playlist items" ON automation_playlist_items
    FOR DELETE USING (
        playlist_id IN (
            SELECT id FROM automation_playlists WHERE
            channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        )
    );

-- RLS Policies for automation_schedules
CREATE POLICY "Users can view their schedules" ON automation_schedules
    FOR SELECT USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can create schedules for their channels" ON automation_schedules
    FOR INSERT WITH CHECK (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can update their schedules" ON automation_schedules
    FOR UPDATE USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can delete their schedules" ON automation_schedules
    FOR DELETE USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

-- RLS Policies for automation_sessions
CREATE POLICY "Users can view their sessions" ON automation_sessions
    FOR SELECT USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

-- RLS Policies for automation_logs
CREATE POLICY "Users can view their logs" ON automation_logs
    FOR SELECT USING (
        channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

-- Function to create automation playlist
CREATE OR REPLACE FUNCTION create_automation_playlist(
    _channel_id UUID,
    _name TEXT,
    _description TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    playlist_id UUID;
BEGIN
    -- Validate channel ownership
    IF NOT EXISTS (
        SELECT 1 FROM channels
        WHERE id = _channel_id
        AND owner_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Channel not found or not authorized';
    END IF;

    -- Create playlist
    INSERT INTO automation_playlists (channel_id, name, description)
    VALUES (_channel_id, _name, _description)
    RETURNING id INTO playlist_id;

    RETURN playlist_id;
END;
$$;

-- Function to add items to playlist
CREATE OR REPLACE FUNCTION add_playlist_item(
    _playlist_id UUID,
    _content_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item_id UUID;
    next_position INTEGER;
BEGIN
    -- Validate playlist ownership
    IF NOT EXISTS (
        SELECT 1 FROM automation_playlists ap
        JOIN channels c ON ap.channel_id = c.id
        WHERE ap.id = _playlist_id
        AND c.owner_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Playlist not found or not authorized';
    END IF;

    -- Get next position
    SELECT COALESCE(MAX(position), 0) + 1 INTO next_position
    FROM automation_playlist_items
    WHERE playlist_id = _playlist_id;

    -- Add item
    INSERT INTO automation_playlist_items (playlist_id, content_id, position)
    VALUES (_playlist_id, _content_id, next_position)
    RETURNING id INTO item_id;

    RETURN item_id;
END;
$$;

-- Function to create automation schedule
CREATE OR REPLACE FUNCTION create_automation_schedule(
    _channel_id UUID,
    _playlist_id UUID,
    _trigger_type TEXT,
    _start_hour INTEGER DEFAULT NULL,
    _start_minute INTEGER DEFAULT NULL,
    _end_hour INTEGER DEFAULT NULL,
    _end_minute INTEGER DEFAULT NULL,
    _days_of_week INTEGER[] DEFAULT NULL,
    _timezone TEXT DEFAULT 'UTC'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    schedule_id UUID;
BEGIN
    -- Validate channel ownership
    IF NOT EXISTS (
        SELECT 1 FROM channels
        WHERE id = _channel_id
        AND owner_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Channel not found or not authorized';
    END IF;

    -- Validate playlist ownership
    IF NOT EXISTS (
        SELECT 1 FROM automation_playlists
        WHERE id = _playlist_id
        AND channel_id = _channel_id
    ) THEN
        RAISE EXCEPTION 'Playlist not found or not authorized';
    END IF;

    -- Create schedule
    INSERT INTO automation_schedules (
        channel_id, playlist_id, trigger_type,
        start_hour, start_minute, end_hour, end_minute,
        days_of_week, timezone
    )
    VALUES (
        _channel_id, _playlist_id, _trigger_type,
        _start_hour, _start_minute, _end_hour, _end_minute,
        _days_of_week, _timezone
    )
    RETURNING id INTO schedule_id;

    RETURN schedule_id;
END;
$$;

-- Function to start automation session
CREATE OR REPLACE FUNCTION start_automation_session(
    _schedule_id UUID,
    _room_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    session_id UUID;
    schedule_record RECORD;
BEGIN
    -- Get schedule and validate
    SELECT as.*, ap.id as playlist_id FROM automation_schedules as
    JOIN automation_playlists ap ON as.playlist_id = ap.id
    INTO schedule_record
    WHERE as.id = _schedule_id;

    IF schedule_record IS NULL THEN
        RAISE EXCEPTION 'Schedule not found';
    END IF;

    -- Validate channel ownership
    IF NOT EXISTS (
        SELECT 1 FROM channels
        WHERE id = schedule_record.channel_id
        AND owner_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- Create session
    INSERT INTO automation_sessions (
        channel_id, schedule_id, playlist_id,
        status, livekit_room_name, started_at,
        total_items
    )
    SELECT
        schedule_record.channel_id,
        _schedule_id,
        schedule_record.playlist_id,
        'running',
        _room_name,
        NOW(),
        COUNT(*)
    FROM automation_playlist_items
    WHERE playlist_id = schedule_record.playlist_id
    RETURNING id INTO session_id;

    -- Log event
    INSERT INTO automation_logs (channel_id, session_id, event_type, message)
    VALUES (schedule_record.channel_id, session_id, 'started', 'Automation session started');

    RETURN session_id;
END;
$$;

-- Function to update automation session
CREATE OR REPLACE FUNCTION update_automation_session(
    _session_id UUID,
    _status TEXT,
    _current_item_number INTEGER DEFAULT NULL,
    _egress_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate ownership via channel
    IF NOT EXISTS (
        SELECT 1 FROM automation_sessions
        WHERE id = _session_id
        AND channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'Session not found or not authorized';
    END IF;

    -- Update session
    UPDATE automation_sessions
    SET
        status = _status,
        current_item_number = COALESCE(_current_item_number, current_item_number),
        livekit_egress_id = COALESCE(_egress_id, livekit_egress_id),
        ended_at = CASE WHEN _status = 'completed' THEN NOW() ELSE ended_at END
    WHERE id = _session_id;
END;
$$;

-- Function to stop automation session
CREATE OR REPLACE FUNCTION stop_automation_session(
    _session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    channel_id_val UUID;
BEGIN
    -- Get and validate session
    SELECT channel_id INTO channel_id_val
    FROM automation_sessions
    WHERE id = _session_id
    AND channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid());

    IF channel_id_val IS NULL THEN
        RAISE EXCEPTION 'Session not found or not authorized';
    END IF;

    -- Update session
    UPDATE automation_sessions
    SET status = 'completed', ended_at = NOW()
    WHERE id = _session_id;

    -- Log event
    INSERT INTO automation_logs (channel_id, session_id, event_type, message)
    VALUES (channel_id_val, _session_id, 'stopped', 'Automation session stopped');
END;
$$;

-- Trigger to update automation_playlists timestamp
CREATE OR REPLACE FUNCTION update_automation_playlists_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_automation_playlists_updated_at
    BEFORE UPDATE ON automation_playlists
    FOR EACH ROW
    EXECUTE FUNCTION update_automation_playlists_timestamp();

-- Trigger to update automation_schedules timestamp
CREATE OR REPLACE FUNCTION update_automation_schedules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_automation_schedules_updated_at
    BEFORE UPDATE ON automation_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_automation_schedules_timestamp();