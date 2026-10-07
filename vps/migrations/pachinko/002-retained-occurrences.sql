-- Only occurrences assigned in this exact snapshot are provable in a v1 DB.
-- Retention across old snapshot chains is intentionally left unknown.
BEGIN IMMEDIATE;
ALTER TABLE p_snapshot_members ADD COLUMN dated_occurrence_count INTEGER NOT NULL DEFAULT 0
  CHECK(dated_occurrence_count>=0 AND dated_occurrence_count<=occurrence_count);
UPDATE p_snapshot_members SET dated_occurrence_count=MIN(occurrence_count,
  (SELECT COUNT(*) FROM p_machine_days d
   WHERE d.current_snapshot_id=p_snapshot_members.snapshot_id AND d.record_id=p_snapshot_members.record_id));
PRAGMA user_version=2;
COMMIT;
