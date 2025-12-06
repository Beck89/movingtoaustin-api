-- Migration: Add progress history table for tracking sync progress over time
-- This allows the dashboard to show historical progress data

CREATE TABLE IF NOT EXISTS mls.progress_history (
    id SERIAL PRIMARY KEY,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_properties INTEGER NOT NULL,
    active_properties INTEGER NOT NULL,
    total_media INTEGER NOT NULL,
    downloaded_media INTEGER NOT NULL,
    missing_media INTEGER NOT NULL,
    download_percentage INTEGER NOT NULL,
    properties_with_missing_media INTEGER NOT NULL,
    media_worker_downloads INTEGER DEFAULT 0,
    api_rate_limited BOOLEAN DEFAULT FALSE,
    media_cdn_rate_limited BOOLEAN DEFAULT FALSE
);

-- Index for efficient time-based queries
CREATE INDEX IF NOT EXISTS idx_progress_history_recorded_at ON mls.progress_history(recorded_at DESC);

-- Keep only last 7 days of history (cleanup can be done via cron or manually)
-- For now, we'll just create the table