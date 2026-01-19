ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'::jsonb;

UPDATE reviews
SET image_urls = '[]'::jsonb
WHERE image_urls IS NULL;
