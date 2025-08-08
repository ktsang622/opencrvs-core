-- Housekeeping for sync_request table
-- Remove successful requests after 7 days
DELETE FROM sync_request 
WHERE status = 'completed' 
AND processed_at < NOW() - INTERVAL '7 days';

-- Remove old failed requests after 30 days (keep longer for debugging)
DELETE FROM sync_request 
WHERE status = 'failed' 
AND created_at < NOW() - INTERVAL '30 days';

-- Optional: Clear payload data but keep metadata for audit
-- UPDATE sync_request 
-- SET payload = NULL 
-- WHERE status = 'completed' 
-- AND processed_at < NOW() - INTERVAL '1 day';