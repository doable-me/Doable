-- 019: Security Scanning
-- Adds security scan tracking and findings storage for project security analysis.

-- ─── Security scans table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS security_scans (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scan_type       text        NOT NULL DEFAULT 'full',   -- 'full', 'dependencies', 'secrets', 'code-quality'
    status          text        NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    findings_count  int         NOT NULL DEFAULT 0,
    started_at      timestamptz,
    completed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_scans_project ON security_scans(project_id);
CREATE INDEX IF NOT EXISTS idx_security_scans_project_created ON security_scans(project_id, created_at DESC);

-- ─── Security findings table ────────────────────────────────
CREATE TABLE IF NOT EXISTS security_findings (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id         uuid        NOT NULL REFERENCES security_scans(id) ON DELETE CASCADE,
    severity        text        NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    category        text        NOT NULL, -- 'dependency', 'secret', 'code-quality'
    title           text        NOT NULL,
    description     text,
    file_path       text,
    line_number     int,
    code_snippet    text,
    fix_suggestion  text,
    dismissed       boolean     NOT NULL DEFAULT false,
    dismissed_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_findings_scan ON security_findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_security_findings_severity ON security_findings(scan_id, severity);

-- ─── Password reset tokens table ────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      text        NOT NULL UNIQUE,
    expires_at      timestamptz NOT NULL,
    used_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
