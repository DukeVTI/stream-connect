-- Create simulcast_partnerships table
CREATE TABLE simulcast_partnerships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    primary_channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    secondary_channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'active', 'ended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,

    -- Ensure channels are different
    CONSTRAINT different_channels CHECK (primary_channel_id != secondary_channel_id),

    -- Ensure unique active partnerships between same channels
    CONSTRAINT unique_active_partnerships UNIQUE (primary_channel_id, secondary_channel_id) DEFERRABLE INITIALLY DEFERRED
);

-- Create simulcast_sessions table to track active simulcasts
CREATE TABLE simulcast_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partnership_id UUID NOT NULL REFERENCES simulcast_partnerships(id) ON DELETE CASCADE,
    primary_session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    secondary_session_id UUID REFERENCES live_sessions(id) ON DELETE SET NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,

    -- Ensure unique active simulcast per partnership
    CONSTRAINT unique_active_simulcast UNIQUE (partnership_id) DEFERRABLE INITIALLY DEFERRED
);

-- Add indexes for performance
CREATE INDEX idx_simulcast_partnerships_primary_channel ON simulcast_partnerships(primary_channel_id);
CREATE INDEX idx_simulcast_partnerships_secondary_channel ON simulcast_partnerships(secondary_channel_id);
CREATE INDEX idx_simulcast_partnerships_status ON simulcast_partnerships(status);
CREATE INDEX idx_simulcast_sessions_partnership ON simulcast_sessions(partnership_id);

-- Enable RLS
ALTER TABLE simulcast_partnerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulcast_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for simulcast_partnerships
CREATE POLICY "Users can view partnerships involving their channels" ON simulcast_partnerships
    FOR SELECT USING (
        primary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid()) OR
        secondary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can create partnerships for their channels" ON simulcast_partnerships
    FOR INSERT WITH CHECK (
        primary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

CREATE POLICY "Channel owners can update their partnerships" ON simulcast_partnerships
    FOR UPDATE USING (
        primary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid()) OR
        secondary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
    );

-- RLS Policies for simulcast_sessions
CREATE POLICY "Users can view sessions for their partnerships" ON simulcast_sessions
    FOR SELECT USING (
        partnership_id IN (
            SELECT id FROM simulcast_partnerships WHERE
            primary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid()) OR
            secondary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        )
    );

CREATE POLICY "Users can create sessions for their partnerships" ON simulcast_sessions
    FOR INSERT WITH CHECK (
        partnership_id IN (
            SELECT id FROM simulcast_partnerships WHERE
            primary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        )
    );

CREATE POLICY "Channel owners can update their sessions" ON simulcast_sessions
    FOR UPDATE USING (
        partnership_id IN (
            SELECT id FROM simulcast_partnerships WHERE
            primary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid()) OR
            secondary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        )
    );

-- Function to request simulcast partnership
CREATE OR REPLACE FUNCTION request_simulcast_partnership(
    _primary_channel_id UUID,
    _secondary_channel_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    partnership_id UUID;
BEGIN
    -- Validate that primary channel is owned by caller and is paid tier
    IF NOT EXISTS (
        SELECT 1 FROM channels
        WHERE id = _primary_channel_id
        AND owner_id = auth.uid()
        AND subscription_tier = 'paid'
    ) THEN
        RAISE EXCEPTION 'Primary channel must be owned by you and be a paid channel';
    END IF;

    -- Validate that secondary channel exists and is paid tier
    IF NOT EXISTS (
        SELECT 1 FROM channels
        WHERE id = _secondary_channel_id
        AND subscription_tier = 'paid'
    ) THEN
        RAISE EXCEPTION 'Secondary channel must be a paid channel';
    END IF;

    -- Check if partnership already exists (in any state)
    IF EXISTS (
        SELECT 1 FROM simulcast_partnerships
        WHERE primary_channel_id = _primary_channel_id
        AND secondary_channel_id = _secondary_channel_id
        AND status IN ('pending', 'accepted', 'active')
    ) THEN
        RAISE EXCEPTION 'Partnership already exists between these channels';
    END IF;

    -- Create partnership
    INSERT INTO simulcast_partnerships (primary_channel_id, secondary_channel_id)
    VALUES (_primary_channel_id, _secondary_channel_id)
    RETURNING id INTO partnership_id;

    RETURN partnership_id;
END;
$$;

-- Function to accept simulcast partnership
CREATE OR REPLACE FUNCTION accept_simulcast_partnership(
    _partnership_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate that secondary channel is owned by caller
    IF NOT EXISTS (
        SELECT 1 FROM simulcast_partnerships sp
        JOIN channels c ON sp.secondary_channel_id = c.id
        WHERE sp.id = _partnership_id
        AND c.owner_id = auth.uid()
        AND sp.status = 'pending'
    ) THEN
        RAISE EXCEPTION 'You can only accept partnerships for channels you own';
    END IF;

    -- Update partnership status
    UPDATE simulcast_partnerships
    SET status = 'accepted', updated_at = NOW()
    WHERE id = _partnership_id;
END;
$$;

-- Function to reject simulcast partnership
CREATE OR REPLACE FUNCTION reject_simulcast_partnership(
    _partnership_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate that secondary channel is owned by caller
    IF NOT EXISTS (
        SELECT 1 FROM simulcast_partnerships sp
        JOIN channels c ON sp.secondary_channel_id = c.id
        WHERE sp.id = _partnership_id
        AND c.owner_id = auth.uid()
        AND sp.status = 'pending'
    ) THEN
        RAISE EXCEPTION 'You can only reject partnerships for channels you own';
    END IF;

    -- Update partnership status
    UPDATE simulcast_partnerships
    SET status = 'rejected', updated_at = NOW()
    WHERE id = _partnership_id;
END;
$$;

-- Function to start simulcast session
CREATE OR REPLACE FUNCTION start_simulcast_session(
    _partnership_id UUID,
    _primary_session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    session_id UUID;
    secondary_channel_id UUID;
BEGIN
    -- Get secondary channel ID and validate ownership
    SELECT sp.secondary_channel_id INTO secondary_channel_id
    FROM simulcast_partnerships sp
    WHERE sp.id = _partnership_id
    AND sp.status = 'accepted'
    AND sp.primary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid());

    IF secondary_channel_id IS NULL THEN
        RAISE EXCEPTION 'Invalid partnership or not authorized';
    END IF;

    -- Validate primary session exists and is active
    IF NOT EXISTS (
        SELECT 1 FROM live_sessions
        WHERE id = _primary_session_id
        AND channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        AND status = 'live'
    ) THEN
        RAISE EXCEPTION 'Primary session must be active and owned by you';
    END IF;

    -- Create simulcast session
    INSERT INTO simulcast_sessions (partnership_id, primary_session_id)
    VALUES (_partnership_id, _primary_session_id)
    RETURNING id INTO session_id;

    -- Update partnership status
    UPDATE simulcast_partnerships
    SET status = 'active', started_at = NOW(), updated_at = NOW()
    WHERE id = _partnership_id;

    RETURN session_id;
END;
$$;

-- Function to end simulcast session
CREATE OR REPLACE FUNCTION end_simulcast_session(
    _partnership_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    session_id UUID;
BEGIN
    -- Validate ownership of either channel
    IF NOT EXISTS (
        SELECT 1 FROM simulcast_partnerships sp
        WHERE sp.id = _partnership_id
        AND (
            sp.primary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid()) OR
            sp.secondary_channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
        )
        AND sp.status = 'active'
    ) THEN
        RAISE EXCEPTION 'You can only end simulcasts for channels you own';
    END IF;

    -- Get and update simulcast session
    UPDATE simulcast_sessions
    SET ended_at = NOW()
    WHERE partnership_id = _partnership_id
    AND ended_at IS NULL
    RETURNING id INTO session_id;

    -- Update partnership status
    UPDATE simulcast_partnerships
    SET status = 'ended', ended_at = NOW(), updated_at = NOW()
    WHERE id = _partnership_id;
END;
$$;

-- Function to get simulcast info for a session
CREATE OR REPLACE FUNCTION get_simulcast_info(_session_id UUID)
RETURNS TABLE (
    partnership_id UUID,
    secondary_channel_id UUID,
    secondary_channel_name TEXT,
    secondary_channel_avatar_url TEXT,
    simulcast_session_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sp.id as partnership_id,
        sp.secondary_channel_id,
        c.name as secondary_channel_name,
        c.avatar_url as secondary_channel_avatar_url,
        ss.id as simulcast_session_id
    FROM simulcast_sessions ss
    JOIN simulcast_partnerships sp ON ss.partnership_id = sp.id
    JOIN channels c ON sp.secondary_channel_id = c.id
    WHERE ss.primary_session_id = _session_id
    AND ss.ended_at IS NULL
    AND sp.status = 'active';
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_simulcast_partnerships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_simulcast_partnerships_updated_at
    BEFORE UPDATE ON simulcast_partnerships
    FOR EACH ROW
    EXECUTE FUNCTION update_simulcast_partnerships_updated_at();