CREATE TABLE IF NOT EXISTS event (
  id UUID PRIMARY KEY,
  organizer_id UUID NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  timezone TEXT NOT NULL DEFAULT 'America/Bogota',
  uploads_enabled BOOLEAN NOT NULL DEFAULT false,
  guest_gallery_enabled BOOLEAN NOT NULL DEFAULT false,
  moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
  pin_enabled BOOLEAN NOT NULL DEFAULT false,
  idempotency_key TEXT UNIQUE,
  idempotency_payload_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS event_organizer_id_status_idx
ON event(organizer_id, status);
