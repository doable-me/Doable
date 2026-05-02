-- 061_project_runtime.sql
-- Phase 5 of framework-agnostic init: per-project runtime registry.
-- See devframeworkPRD/06-runtime-and-publish.md §5.

CREATE TABLE IF NOT EXISTS project_runtime (
  project_id        uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  framework_id      text NOT NULL,
  framework_version text,
  runtime_kind      text NOT NULL CHECK (runtime_kind IN ('static','process')),
  listen_kind       text CHECK (listen_kind IN ('unix-socket','tcp-port')),
  listen_addr       text,
  systemd_unit      text,
  state             text NOT NULL CHECK (state IN ('stopped','starting','running','failed','draining'))
                            DEFAULT 'stopped',
  last_active_at    timestamptz,
  last_started_at   timestamptz,
  fail_count        int  NOT NULL DEFAULT 0,
  idle_timeout_ms   int,
  needs_restart     boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_runtime_state_idx ON project_runtime (state);
CREATE INDEX IF NOT EXISTS project_runtime_idle_idx ON project_runtime (last_active_at) WHERE state = 'running';

CREATE TABLE IF NOT EXISTS runtime_port_allocation (
  port            int PRIMARY KEY CHECK (port BETWEEN 4100 AND 6100),
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  allocated_at    timestamptz NOT NULL DEFAULT now()
);
-- Pre-seed all ports as free (project_id NULL = free).
INSERT INTO runtime_port_allocation (port)
  SELECT generate_series(4100, 6100)
  ON CONFLICT (port) DO NOTHING;
