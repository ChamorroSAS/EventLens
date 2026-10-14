-- Match the accepted event PIN fields used by draft configuration and guest entry.
-- Nullable columns preserve existing events without PIN credentials.
ALTER TABLE event
  ADD COLUMN pin_hash TEXT,
  ADD COLUMN pin_salt TEXT;
