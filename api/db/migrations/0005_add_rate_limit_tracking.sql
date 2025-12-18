-- Migration: Add rate limit tracking tables
-- Purpose: Track rate limit events and problematic properties for debugging

-- Table to track rate limit events
CREATE TABLE IF NOT EXISTS mls.rate_limit_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,  -- 'api_429', 'cdn_429', 'hourly_limit', 'daily_limit'
    source VARCHAR(100),              -- 'media_worker', 'property_sync', 'member_sync', etc.
    listing_key VARCHAR(100),         -- Property that triggered the rate limit (if applicable)
    endpoint VARCHAR(500),            -- API endpoint that was called
    response_body TEXT,               -- Response body from the rate limit
    response_headers TEXT,            -- Response headers (may contain retry-after)
    request_count_at_event INTEGER,   -- How many requests were made before this event
    cooldown_until TIMESTAMP WITH TIME ZONE,  -- When the cooldown expires
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying recent events
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created_at ON mls.rate_limit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_listing_key ON mls.rate_limit_events(listing_key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_event_type ON mls.rate_limit_events(event_type);

-- Table to track properties that repeatedly cause issues
CREATE TABLE IF NOT EXISTS mls.problematic_properties (
    listing_key VARCHAR(100) PRIMARY KEY,
    rate_limit_count INTEGER DEFAULT 0,        -- Number of times this property caused rate limits
    consecutive_fails INTEGER DEFAULT 0,       -- Consecutive failures without success
    last_rate_limit_at TIMESTAMP WITH TIME ZONE,
    first_rate_limit_at TIMESTAMP WITH TIME ZONE,
    cooldown_until TIMESTAMP WITH TIME ZONE,   -- When this property can be retried
    status VARCHAR(50) DEFAULT 'active',       -- 'active', 'cooldown', 'permanent_skip'
    notes TEXT,                                -- Human-readable notes about the issue
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding properties in cooldown
CREATE INDEX IF NOT EXISTS idx_problematic_properties_status ON mls.problematic_properties(status);
CREATE INDEX IF NOT EXISTS idx_problematic_properties_cooldown ON mls.problematic_properties(cooldown_until);

-- Function to clean up old rate limit events (keep last 7 days)
CREATE OR REPLACE FUNCTION mls.cleanup_old_rate_limit_events() RETURNS void AS $$
BEGIN
    DELETE FROM mls.rate_limit_events WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Summary view for rate limit statistics
CREATE OR REPLACE VIEW mls.rate_limit_summary AS
SELECT 
    date_trunc('hour', created_at) as hour,
    event_type,
    COUNT(*) as event_count,
    COUNT(DISTINCT listing_key) as unique_properties
FROM mls.rate_limit_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY date_trunc('hour', created_at), event_type
ORDER BY hour DESC, event_type;

-- View for problematic properties summary
CREATE OR REPLACE VIEW mls.problematic_properties_summary AS
SELECT 
    pp.listing_key,
    pp.rate_limit_count,
    pp.consecutive_fails,
    pp.status,
    pp.cooldown_until,
    pp.first_rate_limit_at,
    pp.last_rate_limit_at,
    p.standard_status as property_status,
    p.modification_timestamp,
    (SELECT COUNT(*) FROM mls.media m WHERE m.listing_key = pp.listing_key AND m.local_url IS NULL) as missing_media_count
FROM mls.problematic_properties pp
LEFT JOIN mls.properties p ON p.listing_key = pp.listing_key
ORDER BY pp.rate_limit_count DESC;
