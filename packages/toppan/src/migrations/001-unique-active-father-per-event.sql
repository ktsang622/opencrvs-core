-- Migration: Add unique index to prevent multiple active fathers per event
-- This ensures data integrity for father participant corrections

-- Create partial unique index to guarantee one active father per event
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_father_per_event
ON event_participant(event_id)
WHERE role='father' AND status='active' AND ended_at IS NULL;

-- Add comment for documentation
COMMENT ON INDEX uniq_active_father_per_event IS 'Ensures only one active father participant per event';