-- Create app_settings table for storing API keys and other configuration
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default kie.ai API key placeholder
INSERT INTO app_settings (key, value) VALUES ('kie_api_key', '')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/update settings
CREATE POLICY "Admins can view settings" ON app_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

CREATE POLICY "Admins can update settings" ON app_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Service role can access for edge functions
CREATE POLICY "Service role full access" ON app_settings
  FOR ALL USING (auth.role() = 'service_role');
