-- Settings table for runtime configuration
-- This allows the API to communicate with the ETL process

CREATE TABLE IF NOT EXISTS mls.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO mls.settings (key, value, description) VALUES
    ('media_download_delay_ms', '1500', 'Delay in milliseconds after each successful media download (500-5000ms)')
ON CONFLICT (key) DO NOTHING;
