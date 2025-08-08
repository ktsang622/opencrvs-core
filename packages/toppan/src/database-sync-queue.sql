-- Sync request tracking table
CREATE TABLE IF NOT EXISTS sync_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'birth', 'death', etc
  action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
  crvs_event_uuid UUID NOT NULL,
  payload JSONB NOT NULL, -- full FHIR bundle
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  error_message TEXT NULL,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_request_status ON sync_request(status);
CREATE INDEX IF NOT EXISTS idx_sync_request_crvs_uuid ON sync_request(crvs_event_uuid);
CREATE INDEX IF NOT EXISTS idx_sync_request_created_at ON sync_request(created_at);