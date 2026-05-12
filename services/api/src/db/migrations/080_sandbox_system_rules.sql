-- 080_sandbox_system_rules.sql
-- Move ALL hardcoded sandbox lists (hard floors, profile defaults) into a
-- database table so they can be managed via `doable admin` CLI/TUI.
--
-- Three-layer model:
--   scope='global'            → hard floors that apply to ALL profiles
--   scope='profile:<key>'     → per-profile defaults (network allowlists etc.)
--
-- is_floor=true means workspace rules can NEVER override it (e.g. the
-- ipinfo.io block). is_floor=false means a workspace admin can tighten but
-- not loosen.

CREATE TABLE IF NOT EXISTS sandbox_system_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text NOT NULL DEFAULT 'global',
  rule_type     text NOT NULL,
  pattern       text NOT NULL,
  action        text NOT NULL DEFAULT 'deny',
  priority      integer NOT NULL DEFAULT 100,
  is_floor      boolean NOT NULL DEFAULT false,
  enabled       boolean NOT NULL DEFAULT true,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, rule_type, pattern, action)
);

CREATE INDEX IF NOT EXISTS idx_ssr_scope_type
  ON sandbox_system_rules (scope, rule_type);

CREATE INDEX IF NOT EXISTS idx_ssr_enabled
  ON sandbox_system_rules (enabled);

-- ─── Seed: Global hard-floor network denies ───────────────────────────

INSERT INTO sandbox_system_rules (scope, rule_type, pattern, action, priority, is_floor, description)
VALUES
  ('global', 'network', 'ipinfo.io',         'deny', 1, true, 'Block IP geolocation recon'),
  ('global', 'network', '*.ipinfo.io',       'deny', 1, true, 'Block IP geolocation recon (subdomains)'),
  ('global', 'network', '169.254.169.254',   'deny', 1, true, 'Block cloud metadata endpoint (AWS/GCP)')
ON CONFLICT (scope, rule_type, pattern, action) DO NOTHING;

-- ─── Seed: Global hard-floor syscall denies ───────────────────────────

INSERT INTO sandbox_system_rules (scope, rule_type, pattern, action, priority, is_floor, description)
VALUES
  ('global', 'syscall', 'bpf',                  'deny', 1, true, 'CVE-prone: eBPF exploitation'),
  ('global', 'syscall', 'keyctl',               'deny', 1, true, 'CVE-prone: kernel keyring'),
  ('global', 'syscall', 'io_uring_setup',       'deny', 1, true, 'CVE-prone: io_uring'),
  ('global', 'syscall', 'io_uring_enter',       'deny', 1, true, 'CVE-prone: io_uring'),
  ('global', 'syscall', 'io_uring_register',    'deny', 1, true, 'CVE-prone: io_uring'),
  ('global', 'syscall', 'userfaultfd',          'deny', 1, true, 'CVE-prone: use-after-free helper'),
  ('global', 'syscall', 'perf_event_open',      'deny', 1, true, 'CVE-prone: perf subsystem'),
  ('global', 'syscall', 'ptrace',               'deny', 1, true, 'Process debugging/inspection'),
  ('global', 'syscall', 'process_vm_readv',     'deny', 1, true, 'Cross-process memory read'),
  ('global', 'syscall', 'process_vm_writev',    'deny', 1, true, 'Cross-process memory write'),
  ('global', 'syscall', 'unshare',              'deny', 1, true, 'Namespace escape'),
  ('global', 'syscall', 'setns',                'deny', 1, true, 'Namespace escape'),
  ('global', 'syscall', 'mount',                'deny', 1, true, 'Filesystem manipulation'),
  ('global', 'syscall', 'umount',               'deny', 1, true, 'Filesystem manipulation'),
  ('global', 'syscall', 'umount2',              'deny', 1, true, 'Filesystem manipulation'),
  ('global', 'syscall', 'pivot_root',           'deny', 1, true, 'Root filesystem change'),
  ('global', 'syscall', 'chroot',               'deny', 1, true, 'Root filesystem change'),
  ('global', 'syscall', 'kexec_load',           'deny', 1, true, 'Kernel replacement'),
  ('global', 'syscall', 'kexec_file_load',      'deny', 1, true, 'Kernel replacement'),
  ('global', 'syscall', 'init_module',          'deny', 1, true, 'Kernel module loading'),
  ('global', 'syscall', 'finit_module',         'deny', 1, true, 'Kernel module loading'),
  ('global', 'syscall', 'delete_module',        'deny', 1, true, 'Kernel module removal'),
  ('global', 'syscall', 'create_module',        'deny', 1, true, 'Kernel module creation'),
  ('global', 'syscall', 'query_module',         'deny', 1, true, 'Kernel module query'),
  ('global', 'syscall', 'get_kernel_syms',      'deny', 1, true, 'Kernel symbol table'),
  ('global', 'syscall', 'syslog',               'deny', 1, true, 'Kernel log access'),
  ('global', 'syscall', '_sysctl',              'deny', 1, true, 'Deprecated sysctl'),
  ('global', 'syscall', 'lookup_dcookie',       'deny', 1, true, 'Profiling cookie'),
  ('global', 'syscall', 'uselib',               'deny', 1, true, 'Deprecated shared lib loading'),
  ('global', 'syscall', 'iopl',                 'deny', 1, true, 'I/O privilege level'),
  ('global', 'syscall', 'ioperm',               'deny', 1, true, 'I/O port permissions')
ON CONFLICT (scope, rule_type, pattern, action) DO NOTHING;

-- ─── Seed: Global hard-floor package denies ───────────────────────────

INSERT INTO sandbox_system_rules (scope, rule_type, pattern, action, priority, is_floor, description)
VALUES
  ('global', 'package', 'eval',             'deny', 1, true, 'Intrinsically dangerous package'),
  ('global', 'package', 'child_process',    'deny', 1, true, 'Intrinsically dangerous package'),
  ('global', 'package', 'fs-extra-unsafe',  'deny', 1, true, 'Intrinsically dangerous package')
ON CONFLICT (scope, rule_type, pattern, action) DO NOTHING;

-- ─── Seed: Profile network allowlists ─────────────────────────────────

-- ai-bash profile
INSERT INTO sandbox_system_rules (scope, rule_type, pattern, action, priority, is_floor, description)
VALUES
  ('profile:ai-bash', 'network', 'registry.npmjs.org', 'allow', 100, false, 'npm registry'),
  ('profile:ai-bash', 'network', 'api.anthropic.com',  'allow', 100, false, 'Anthropic API'),
  ('profile:ai-bash', 'network', 'api.openai.com',     'allow', 100, false, 'OpenAI API'),
  ('profile:ai-bash', 'network', 'ghcr.io',            'allow', 100, false, 'GitHub Container Registry'),
  ('profile:ai-bash', 'network', 'github.com',         'allow', 100, false, 'GitHub')
ON CONFLICT (scope, rule_type, pattern, action) DO NOTHING;

-- vite-preview profile
INSERT INTO sandbox_system_rules (scope, rule_type, pattern, action, priority, is_floor, description)
VALUES
  ('profile:vite-preview', 'network', 'registry.npmjs.org',    'allow', 100, false, 'npm registry'),
  ('profile:vite-preview', 'network', 'registry.yarnpkg.com',  'allow', 100, false, 'Yarn registry'),
  ('profile:vite-preview', 'network', 'esm.sh',                'allow', 100, false, 'ESM CDN'),
  ('profile:vite-preview', 'network', 'unpkg.com',             'allow', 100, false, 'unpkg CDN'),
  ('profile:vite-preview', 'network', 'cdn.jsdelivr.net',      'allow', 100, false, 'jsDelivr CDN'),
  ('profile:vite-preview', 'network', 'fonts.googleapis.com',  'allow', 100, false, 'Google Fonts CSS'),
  ('profile:vite-preview', 'network', 'fonts.gstatic.com',     'allow', 100, false, 'Google Fonts files')
ON CONFLICT (scope, rule_type, pattern, action) DO NOTHING;

-- install profile
INSERT INTO sandbox_system_rules (scope, rule_type, pattern, action, priority, is_floor, description)
VALUES
  ('profile:install', 'network', 'registry.npmjs.org',      'allow', 100, false, 'npm registry'),
  ('profile:install', 'network', 'registry.yarnpkg.com',    'allow', 100, false, 'Yarn registry'),
  ('profile:install', 'network', 'pypi.org',                'allow', 100, false, 'Python Package Index'),
  ('profile:install', 'network', 'files.pythonhosted.org',  'allow', 100, false, 'PyPI file downloads')
ON CONFLICT (scope, rule_type, pattern, action) DO NOTHING;

-- build profile
INSERT INTO sandbox_system_rules (scope, rule_type, pattern, action, priority, is_floor, description)
VALUES
  ('profile:build', 'network', 'registry.npmjs.org', 'allow', 100, false, 'npm registry'),
  ('profile:build', 'network', '*.sentry.io',        'allow', 100, false, 'Sentry source upload')
ON CONFLICT (scope, rule_type, pattern, action) DO NOTHING;
