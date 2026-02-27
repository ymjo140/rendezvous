-- Add owner_id column to places for merchant scoping
ALTER TABLE places
ADD COLUMN IF NOT EXISTS owner_id UUID;
