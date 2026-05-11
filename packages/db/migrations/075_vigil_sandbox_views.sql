-- 075: Vigil dashboard views for sandbox posture + denials.
-- Per SandboxAgnosticSandboxingPRD ch 10 "Vigil dashboard widgets".

-- 1. Posture: current backend + composers + hardening (last entry per workspace)
CREATE OR REPLACE VIEW v_sandbox_posture AS
SELECT DISTINCT ON (workspace_id)
  workspace_id,
  backend_id,
  declared_layers,
  composers,
  started_at as last_seen_at
FROM audit_sandbox_spawn
ORDER BY workspace_id, started_at DESC;

-- 2. Spawn denials (24h) — exit_code = -1 or specific denial markers in argv jsonb
CREATE OR REPLACE VIEW v_sandbox_spawn_denials_24h AS
SELECT
  workspace_id,
  profile_key,
  count(*) AS denial_count,
  max(started_at) AS last_denial_at
FROM audit_sandbox_spawn
WHERE started_at >= now() - interval '24 hours'
  AND (exit_code IS NULL OR exit_code < 0)
GROUP BY workspace_id, profile_key
ORDER BY denial_count DESC;

-- 3. OOM kills (7d)
CREATE OR REPLACE VIEW v_sandbox_oom_7d AS
SELECT
  workspace_id,
  profile_key,
  count(*) AS oom_count,
  avg(duration_ms)::int AS avg_duration_ms,
  max(started_at) AS last_oom_at
FROM audit_sandbox_spawn
WHERE started_at >= now() - interval '7 days'
  AND oom_killed = true
GROUP BY workspace_id, profile_key
ORDER BY oom_count DESC;

-- 4. Timeouts (7d)
CREATE OR REPLACE VIEW v_sandbox_timeouts_7d AS
SELECT
  workspace_id,
  profile_key,
  count(*) AS timeout_count,
  avg(duration_ms)::int AS avg_duration_ms,
  max(started_at) AS last_timeout_at
FROM audit_sandbox_spawn
WHERE started_at >= now() - interval '7 days'
  AND timed_out = true
GROUP BY workspace_id, profile_key
ORDER BY timeout_count DESC;

-- 5. Network denies (24h) — unnest the network_denied array
CREATE OR REPLACE VIEW v_sandbox_network_denies_24h AS
SELECT
  workspace_id,
  hostname,
  count(*) AS deny_count,
  max(started_at) AS last_deny_at
FROM audit_sandbox_spawn, unnest(network_denied) AS hostname
WHERE started_at >= now() - interval '24 hours'
GROUP BY workspace_id, hostname
ORDER BY deny_count DESC;

-- 6. Backend unavailability (counts of times the resolver had to fall back)
-- We track this by counting distinct backend_ids per workspace in last 7d
CREATE OR REPLACE VIEW v_sandbox_backend_flips_7d AS
SELECT
  workspace_id,
  backend_id,
  count(*) AS spawn_count,
  min(started_at) AS first_seen_at,
  max(started_at) AS last_seen_at
FROM audit_sandbox_spawn
WHERE started_at >= now() - interval '7 days'
GROUP BY workspace_id, backend_id
ORDER BY workspace_id, spawn_count DESC;

-- View comments
COMMENT ON VIEW v_sandbox_posture IS 'Latest backend+composers seen per workspace. Vigil "Sandbox posture" card.';
COMMENT ON VIEW v_sandbox_spawn_denials_24h IS 'Spawn denials by profile per workspace (last 24h).';
COMMENT ON VIEW v_sandbox_oom_7d IS 'OOM kills by profile per workspace (last 7d).';
COMMENT ON VIEW v_sandbox_timeouts_7d IS 'Timeouts by profile per workspace (last 7d).';
COMMENT ON VIEW v_sandbox_network_denies_24h IS 'Network denies by hostname per workspace (last 24h).';
COMMENT ON VIEW v_sandbox_backend_flips_7d IS 'Distinct backends used per workspace (last 7d) — flips visible as multiple rows.';

-- Grant read access to the API role (assumes role 'doable_api' exists — soft-fail if not)
DO $$
BEGIN
  EXECUTE 'GRANT SELECT ON v_sandbox_posture, v_sandbox_spawn_denials_24h, v_sandbox_oom_7d, v_sandbox_timeouts_7d, v_sandbox_network_denies_24h, v_sandbox_backend_flips_7d TO doable_api';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
