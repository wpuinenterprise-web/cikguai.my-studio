-- Add product details columns to automation_workflows
ALTER TABLE automation_workflows
ADD COLUMN IF NOT EXISTS product_name text,
ADD COLUMN IF NOT EXISTS product_description text,
ADD COLUMN IF NOT EXISTS target_audience text,
ADD COLUMN IF NOT EXISTS content_style text DEFAULT 'professional';
