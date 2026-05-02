-- 063_egress_hosts.sql
-- Phase 5 §13.3: per-project egress allow-list. systemd applies via
-- IPAddressAllow=<host> in the per-app drop-in.

ALTER TABLE project_runtime
  ADD COLUMN IF NOT EXISTS egress_hosts text[] NOT NULL DEFAULT '{}';
