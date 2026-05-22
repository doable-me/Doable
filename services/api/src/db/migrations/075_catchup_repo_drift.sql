-- 075_catchup_repo_drift.sql
-- Auto-generated catch-up of schema present on existing servers (zantaz)
-- but never reflected in repo migrations 001-074. Captures 30 tables, 1 enum,
-- 4 functions, 1 trigger, plus column-level drift on shared tables.
-- Idempotent where possible (CREATE TABLE/INDEX IF NOT EXISTS, DO-EXCEPTION
-- for enum, CREATE OR REPLACE for functions). FK constraints from pg_dump
-- aren't IF-NOT-EXISTS guarded; this migration assumes a fresh install where
-- the constraints don't yet exist.

-- ─── ENUMS ─────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE custom_domain_status AS ENUM ('pending','verifying','ssl_pending','active','failed','removing'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── FUNCTIONS (must come before tables; some triggers reference them) ─────

CREATE OR REPLACE FUNCTION public.update_custom_domains_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_subscriptions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_discover_featured()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_discover_featured;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW mv_discover_featured;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_marketplace_featured()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_marketplace_featured;
EXCEPTION WHEN OTHERS THEN
  -- First refresh can't be CONCURRENTLY; fall back to plain refresh.
  REFRESH MATERIALIZED VIEW mv_marketplace_featured;
END;
$function$;

-- ─── TABLES + their constraints/indexes/triggers (verbatim from pg_dump) ───







CREATE TABLE IF NOT EXISTS public.analytics_daily_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    date date NOT NULL,
    visitors integer DEFAULT 0 NOT NULL,
    page_views integer DEFAULT 0 NOT NULL,
    sessions integer DEFAULT 0 NOT NULL,
    bounces integer DEFAULT 0 NOT NULL,
    total_duration integer DEFAULT 0 NOT NULL,
    total_visitors integer DEFAULT 0 NOT NULL,
    unique_visitors integer DEFAULT 0 NOT NULL,
    bounce_count integer DEFAULT 0 NOT NULL,
    avg_duration_ms integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);



CREATE TABLE IF NOT EXISTS public.analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    session_id text NOT NULL,
    event_type text DEFAULT 'page_view'::text NOT NULL,
    path text DEFAULT '/'::text NOT NULL,
    referrer text,
    user_agent text,
    device_type text,
    browser text,
    os text,
    country text,
    screen_width integer,
    screen_height integer,
    duration integer DEFAULT 0,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    visitor_id text,
    event_data jsonb
);



CREATE TABLE IF NOT EXISTS public.analytics_settings (
    project_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    workspace_id uuid NOT NULL,
    amount integer NOT NULL,
    type text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.custom_domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    domain text NOT NULL,
    status public.custom_domain_status DEFAULT 'pending'::public.custom_domain_status NOT NULL,
    cloudflare_hostname_id text,
    ssl_status text,
    verification_txt_name text,
    verification_txt_value text,
    cname_target text DEFAULT 'custom.doable.me'::text NOT NULL,
    verification_errors text,
    last_checked_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.design_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    display_name text,
    user_color text,
    x_percent real NOT NULL,
    y_percent real NOT NULL,
    selector text,
    page_path text DEFAULT 'index.html'::text NOT NULL,
    content text NOT NULL,
    parent_id uuid,
    resolved boolean DEFAULT false NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.email_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    from_address text DEFAULT 'Doable <noreply@doable.me>'::text NOT NULL,
    credentials_encrypted bytea NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    last_verified_at timestamp with time zone,
    last_error text,
    configured_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_config_provider_check CHECK ((provider = ANY (ARRAY['smtp'::text, 'resend'::text, 'google'::text])))
);



CREATE TABLE IF NOT EXISTS public.email_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    to_address text NOT NULL,
    subject text NOT NULL,
    html text NOT NULL,
    text_body text,
    from_address text,
    template text,
    template_data jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    last_error text,
    next_retry_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'dead'::text])))
);



CREATE TABLE IF NOT EXISTS public.feature_flags (
    feature_key text NOT NULL,
    label text NOT NULL,
    description text,
    enabled boolean DEFAULT true NOT NULL,
    min_plan text,
    min_role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.github_user_tokens (
    user_id uuid NOT NULL,
    github_username text NOT NULL,
    github_id text,
    scopes text DEFAULT 'repo'::text NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    access_token_encrypted text
);



CREATE TABLE IF NOT EXISTS public.mode_tool_config (
    mode text NOT NULL,
    allowed_tools text[] DEFAULT '{}'::text[] NOT NULL,
    description text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.public_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    category text,
    thumbnail_url text,
    remix_count integer DEFAULT 0,
    view_count integer DEFAULT 0,
    featured boolean DEFAULT false,
    published_at timestamp with time zone DEFAULT now(),
    shared_by uuid,
    featured_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);



CREATE TABLE IF NOT EXISTS public.page_views (
    id integer NOT NULL,
    project_id uuid NOT NULL,
    visitor_id text NOT NULL,
    session_id text NOT NULL,
    path text DEFAULT '/'::text NOT NULL,
    referrer text,
    user_agent text,
    device_type text,
    country text,
    duration_ms integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE SEQUENCE public.page_views_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public.page_views_id_seq OWNED BY public.page_views.id;



CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.platform_config (
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);



CREATE TABLE IF NOT EXISTS public.project_collaborators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'editor'::text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_collaborators_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])))
);



CREATE TABLE IF NOT EXISTS public.project_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.project_remixes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_project_id uuid NOT NULL,
    forked_project_id uuid NOT NULL,
    forked_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);



CREATE TABLE IF NOT EXISTS public.project_views (
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.security_findings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scan_id uuid NOT NULL,
    severity text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    description text,
    file_path text,
    line_number integer,
    code_snippet text,
    fix_suggestion text,
    dismissed boolean DEFAULT false NOT NULL,
    dismissed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT security_findings_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
);



CREATE TABLE IF NOT EXISTS public.security_scans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    scan_type text DEFAULT 'full'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    findings_count integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.spans (
    span_id text NOT NULL,
    trace_id text NOT NULL,
    parent_span_id text,
    name text NOT NULL,
    service text NOT NULL,
    kind text,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    duration_ms integer,
    status_code text DEFAULT 'UNSET'::text NOT NULL,
    status_message text,
    attributes jsonb,
    events jsonb,
    exception jsonb,
    CONSTRAINT spans_kind_check CHECK ((kind = ANY (ARRAY['server'::text, 'client'::text, 'internal'::text, 'producer'::text, 'consumer'::text]))),
    CONSTRAINT spans_status_code_check CHECK ((status_code = ANY (ARRAY['UNSET'::text, 'OK'::text, 'ERROR'::text])))
);



CREATE TABLE IF NOT EXISTS public.thumbnail_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    project_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    preview_url text,
    error_message text,
    duration_ms integer,
    triggered_by text DEFAULT 'auto'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE IF NOT EXISTS public.trace_logs (
    id bigint NOT NULL,
    ts timestamp with time zone NOT NULL,
    trace_id text,
    span_id text,
    service text NOT NULL,
    level text NOT NULL,
    message text NOT NULL,
    attributes jsonb
);



CREATE SEQUENCE public.trace_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public.trace_logs_id_seq OWNED BY public.trace_logs.id;



CREATE TABLE IF NOT EXISTS public.trace_view_audit (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    viewer_id uuid NOT NULL,
    viewer_email text,
    viewer_role text NOT NULL,
    trace_id text,
    span_id text,
    workspace_id uuid,
    reason text,
    client_ip inet,
    user_agent text
);



CREATE SEQUENCE public.trace_view_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public.trace_view_audit_id_seq OWNED BY public.trace_view_audit.id;



CREATE TABLE IF NOT EXISTS public.traces (
    trace_id text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    duration_ms integer,
    workspace_id uuid,
    user_id uuid,
    project_id uuid,
    root_span_name text,
    status text DEFAULT 'running'::text NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    span_count integer DEFAULT 0 NOT NULL,
    services text[] DEFAULT ARRAY[]::text[] NOT NULL,
    CONSTRAINT traces_status_check CHECK ((status = ANY (ARRAY['running'::text, 'ok'::text, 'error'::text, 'timeout'::text])))
);



CREATE TABLE IF NOT EXISTS public.tracing_audit_log (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_email text,
    action text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    reason text NOT NULL,
    client_ip inet,
    trace_id text
);



CREATE SEQUENCE public.tracing_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public.tracing_audit_log_id_seq OWNED BY public.tracing_audit_log.id;



CREATE TABLE IF NOT EXISTS public.tracing_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text NOT NULL,
    scope_value text NOT NULL,
    level text NOT NULL,
    reason text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT tracing_overrides_level_check CHECK ((level = ANY (ARRAY['off'::text, 'errors-only'::text, 'sampled'::text, 'full'::text, 'debug'::text]))),
    CONSTRAINT tracing_overrides_scope_check CHECK ((scope = ANY (ARRAY['user'::text, 'workspace'::text, 'route'::text])))
);



CREATE TABLE IF NOT EXISTS public.user_feature_overrides (
    user_id uuid NOT NULL,
    feature_key text NOT NULL,
    enabled boolean NOT NULL
);



ALTER TABLE ONLY public.page_views ALTER COLUMN id SET DEFAULT nextval('public.page_views_id_seq'::regclass);



ALTER TABLE ONLY public.trace_logs ALTER COLUMN id SET DEFAULT nextval('public.trace_logs_id_seq'::regclass);



ALTER TABLE ONLY public.trace_view_audit ALTER COLUMN id SET DEFAULT nextval('public.trace_view_audit_id_seq'::regclass);



ALTER TABLE ONLY public.tracing_audit_log ALTER COLUMN id SET DEFAULT nextval('public.tracing_audit_log_id_seq'::regclass);



DO $idem$ BEGIN ALTER TABLE ONLY public.analytics_daily_stats
    ADD CONSTRAINT analytics_daily_stats_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.analytics_daily_stats
    ADD CONSTRAINT analytics_daily_stats_project_id_date_key UNIQUE (project_id, date); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.analytics_settings
    ADD CONSTRAINT analytics_settings_pkey PRIMARY KEY (project_id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.email_config
    ADD CONSTRAINT email_config_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (feature_key); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.github_user_tokens
    ADD CONSTRAINT github_user_tokens_pkey PRIMARY KEY (user_id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.mode_tool_config
    ADD CONSTRAINT mode_tool_config_pkey PRIMARY KEY (mode); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.page_views
    ADD CONSTRAINT page_views_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.platform_config
    ADD CONSTRAINT platform_config_pkey PRIMARY KEY (key); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_project_id_user_id_key UNIQUE (project_id, user_id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_project_id_file_path_key UNIQUE (project_id, file_path); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_remixes
    ADD CONSTRAINT project_remixes_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_views
    ADD CONSTRAINT project_views_pkey PRIMARY KEY (user_id, project_id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.public_projects
    ADD CONSTRAINT public_projects_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.security_findings
    ADD CONSTRAINT security_findings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.security_scans
    ADD CONSTRAINT security_scans_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.spans
    ADD CONSTRAINT spans_pkey PRIMARY KEY (span_id, started_at); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.thumbnail_logs
    ADD CONSTRAINT thumbnail_logs_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.trace_logs
    ADD CONSTRAINT trace_logs_pkey PRIMARY KEY (id, ts); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.trace_view_audit
    ADD CONSTRAINT trace_view_audit_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.traces
    ADD CONSTRAINT traces_pkey PRIMARY KEY (trace_id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.tracing_audit_log
    ADD CONSTRAINT tracing_audit_log_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.tracing_overrides
    ADD CONSTRAINT tracing_overrides_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.public_projects
    ADD CONSTRAINT uq_public_projects_project UNIQUE (project_id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.user_feature_overrides
    ADD CONSTRAINT user_feature_overrides_pkey PRIMARY KEY (user_id, feature_key); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



CREATE INDEX IF NOT EXISTS idx_analytics_daily_project_date ON public.analytics_daily_stats USING btree (project_id, date);



CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_events USING btree (project_id, event_type);



CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor ON public.analytics_events USING btree (visitor_id);



CREATE INDEX IF NOT EXISTS idx_analytics_project_path ON public.analytics_events USING btree (project_id, path);



CREATE INDEX IF NOT EXISTS idx_analytics_project_timestamp ON public.analytics_events USING btree (project_id, "timestamp");



CREATE INDEX IF NOT EXISTS idx_analytics_session ON public.analytics_events USING btree (session_id);



CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON public.credit_transactions USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);



CREATE INDEX IF NOT EXISTS idx_credit_transactions_workspace ON public.credit_transactions USING btree (workspace_id, created_at DESC);



CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_domains_domain ON public.custom_domains USING btree (domain);



CREATE INDEX IF NOT EXISTS idx_custom_domains_pending ON public.custom_domains USING btree (status) WHERE (status = ANY (ARRAY['pending'::public.custom_domain_status, 'verifying'::public.custom_domain_status, 'ssl_pending'::public.custom_domain_status]));



CREATE INDEX IF NOT EXISTS idx_custom_domains_project ON public.custom_domains USING btree (project_id);



CREATE INDEX IF NOT EXISTS idx_design_comments_parent ON public.design_comments USING btree (parent_id) WHERE (parent_id IS NOT NULL);



CREATE INDEX IF NOT EXISTS idx_design_comments_project ON public.design_comments USING btree (project_id, resolved, created_at);



CREATE UNIQUE INDEX IF NOT EXISTS idx_email_config_active ON public.email_config USING btree (is_active) WHERE (is_active = true);



CREATE INDEX IF NOT EXISTS idx_email_queue_pending ON public.email_queue USING btree (next_retry_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));



CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.email_queue USING btree (status);



CREATE INDEX IF NOT EXISTS idx_page_views_project_created ON public.page_views USING btree (project_id, created_at);



CREATE INDEX IF NOT EXISTS idx_page_views_project_path ON public.page_views USING btree (project_id, path);



CREATE INDEX IF NOT EXISTS idx_page_views_project_visitor ON public.page_views USING btree (project_id, visitor_id);



CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON public.page_views USING btree (visitor_id);



CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON public.password_reset_tokens USING btree (token_hash);



CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON public.password_reset_tokens USING btree (user_id);



CREATE INDEX IF NOT EXISTS idx_project_collaborators_project ON public.project_collaborators USING btree (project_id);



CREATE INDEX IF NOT EXISTS idx_project_collaborators_user ON public.project_collaborators USING btree (user_id);



CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON public.project_files USING btree (project_id);



CREATE INDEX IF NOT EXISTS idx_project_remixes_forked_by ON public.project_remixes USING btree (forked_by);



CREATE INDEX IF NOT EXISTS idx_project_remixes_source ON public.project_remixes USING btree (source_project_id);



CREATE INDEX IF NOT EXISTS idx_project_views_user_recent ON public.project_views USING btree (user_id, viewed_at DESC);



CREATE INDEX IF NOT EXISTS idx_public_projects_category ON public.public_projects USING btree (category);



CREATE INDEX IF NOT EXISTS idx_public_projects_description_trgm ON public.public_projects USING gin (description public.gin_trgm_ops);



CREATE INDEX IF NOT EXISTS idx_public_projects_featured ON public.public_projects USING btree (featured) WHERE (featured = true);



CREATE INDEX IF NOT EXISTS idx_public_projects_featured_view_count ON public.public_projects USING btree (view_count DESC, remix_count DESC) WHERE (featured = true);



CREATE INDEX IF NOT EXISTS idx_public_projects_published_at ON public.public_projects USING btree (published_at DESC);



CREATE INDEX IF NOT EXISTS idx_public_projects_published_view_count ON public.public_projects USING btree (view_count DESC, published_at DESC NULLS LAST);



CREATE INDEX IF NOT EXISTS idx_public_projects_shared_by ON public.public_projects USING btree (shared_by) WHERE (shared_by IS NOT NULL);



CREATE INDEX IF NOT EXISTS idx_public_projects_title_trgm ON public.public_projects USING gin (title public.gin_trgm_ops);



CREATE INDEX IF NOT EXISTS idx_security_findings_scan ON public.security_findings USING btree (scan_id);



CREATE INDEX IF NOT EXISTS idx_security_findings_severity ON public.security_findings USING btree (scan_id, severity);



CREATE INDEX IF NOT EXISTS idx_security_scans_project ON public.security_scans USING btree (project_id);



CREATE INDEX IF NOT EXISTS idx_security_scans_project_created ON public.security_scans USING btree (project_id, created_at DESC);



CREATE INDEX IF NOT EXISTS idx_spans_attrs_gin ON public.spans USING gin (attributes jsonb_path_ops);



CREATE INDEX IF NOT EXISTS idx_spans_errors ON public.spans USING btree (started_at DESC) WHERE (status_code = 'ERROR'::text);



CREATE INDEX IF NOT EXISTS idx_spans_name ON public.spans USING btree (name);



CREATE INDEX IF NOT EXISTS idx_spans_service_started ON public.spans USING btree (service, started_at DESC);



CREATE INDEX IF NOT EXISTS idx_spans_trace ON public.spans USING btree (trace_id);



CREATE INDEX IF NOT EXISTS idx_thumbnail_logs_created ON public.thumbnail_logs USING btree (created_at DESC);



CREATE INDEX IF NOT EXISTS idx_thumbnail_logs_project ON public.thumbnail_logs USING btree (project_id);



CREATE INDEX IF NOT EXISTS idx_trace_logs_level_ts ON public.trace_logs USING btree (level, ts DESC) WHERE (level = ANY (ARRAY['error'::text, 'fatal'::text, 'warn'::text]));



CREATE INDEX IF NOT EXISTS idx_trace_logs_trace ON public.trace_logs USING btree (trace_id) WHERE (trace_id IS NOT NULL);



CREATE INDEX IF NOT EXISTS idx_trace_logs_ts_desc ON public.trace_logs USING btree (ts DESC);



CREATE INDEX IF NOT EXISTS idx_trace_view_audit_viewer ON public.trace_view_audit USING btree (viewer_id, ts DESC);



CREATE INDEX IF NOT EXISTS idx_trace_view_audit_workspace ON public.trace_view_audit USING btree (workspace_id, ts DESC) WHERE (workspace_id IS NOT NULL);



CREATE INDEX IF NOT EXISTS idx_traces_errors ON public.traces USING btree (started_at DESC) WHERE (status = 'error'::text);



CREATE INDEX IF NOT EXISTS idx_traces_project_started ON public.traces USING btree (project_id, started_at DESC) WHERE (project_id IS NOT NULL);



CREATE INDEX IF NOT EXISTS idx_traces_started_desc ON public.traces USING btree (started_at DESC);



CREATE INDEX IF NOT EXISTS idx_traces_user_started ON public.traces USING btree (user_id, started_at DESC) WHERE (user_id IS NOT NULL);



CREATE INDEX IF NOT EXISTS idx_traces_workspace_started ON public.traces USING btree (workspace_id, started_at DESC) WHERE (workspace_id IS NOT NULL);



CREATE INDEX IF NOT EXISTS idx_tracing_overrides_active ON public.tracing_overrides USING btree (scope, scope_value) WHERE (revoked_at IS NULL);



CREATE TRIGGER trg_custom_domains_updated BEFORE UPDATE ON public.custom_domains FOR EACH ROW EXECUTE FUNCTION public.update_custom_domains_timestamp();



DO $idem$ BEGIN ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.design_comments(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.design_comments
    ADD CONSTRAINT design_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.email_config
    ADD CONSTRAINT email_config_configured_by_fkey FOREIGN KEY (configured_by) REFERENCES public.users(id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.mode_tool_config
    ADD CONSTRAINT mode_tool_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id); EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.platform_config
    ADD CONSTRAINT platform_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_remixes
    ADD CONSTRAINT project_remixes_forked_by_fkey FOREIGN KEY (forked_by) REFERENCES public.users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_remixes
    ADD CONSTRAINT project_remixes_forked_project_id_fkey FOREIGN KEY (forked_project_id) REFERENCES public.projects(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.project_remixes
    ADD CONSTRAINT project_remixes_source_project_id_fkey FOREIGN KEY (source_project_id) REFERENCES public.projects(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.public_projects
    ADD CONSTRAINT public_projects_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.public_projects
    ADD CONSTRAINT public_projects_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.users(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.security_findings
    ADD CONSTRAINT security_findings_dismissed_by_fkey FOREIGN KEY (dismissed_by) REFERENCES public.users(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.security_findings
    ADD CONSTRAINT security_findings_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES public.security_scans(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.security_scans
    ADD CONSTRAINT security_scans_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.thumbnail_logs
    ADD CONSTRAINT thumbnail_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.user_feature_overrides
    ADD CONSTRAINT user_feature_overrides_feature_key_fkey FOREIGN KEY (feature_key) REFERENCES public.feature_flags(feature_key) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;



DO $idem$ BEGIN ALTER TABLE ONLY public.user_feature_overrides
    ADD CONSTRAINT user_feature_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL; END $idem$;





-- ─── COLUMN ADDITIONS on existing repo tables ──────────────
ALTER TABLE chat_traces ADD COLUMN IF NOT EXISTS otel_trace_id text;
ALTER TABLE chat_traces ADD COLUMN IF NOT EXISTS otel_root_span_id text;
CREATE INDEX IF NOT EXISTS idx_chat_traces_otel ON chat_traces(otel_trace_id) WHERE otel_trace_id IS NOT NULL;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_workspace ON notifications(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_workspace_unread ON notifications(user_id, workspace_id) WHERE is_read = false;

ALTER TABLE project_api_keys ADD COLUMN IF NOT EXISTS allowed_origins text[];
ALTER TABLE project_api_keys ADD COLUMN IF NOT EXISTS allowed_tools text[];

ALTER TABLE projects ADD COLUMN IF NOT EXISTS connector_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role workspace_role NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON workspace_invites(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- ─── MARKETPLACE INDEXES on existing tables ────────────────
CREATE INDEX IF NOT EXISTS idx_mkt_listings_published_category
  ON marketplace_listings (category_id, install_count DESC)
  WHERE status::text = 'published';
CREATE INDEX IF NOT EXISTS idx_mkt_listings_published_newest
  ON marketplace_listings (published_at DESC NULLS LAST)
  WHERE status::text = 'published';

-- ─── MATERIALIZED VIEWS ────────────────────────────────────
-- These power the discover/marketplace "featured" rails. Refreshed
-- periodically by a worker that calls the refresh_* functions above.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_discover_featured AS
  SELECT pp.id, pp.project_id, pp.title, pp.description, pp.category,
         pp.thumbnail_url, pp.view_count, pp.remix_count, pp.featured,
         pp.published_at, pp.updated_at, pp.shared_by, pp.featured_at,
         u.display_name AS shared_by_name,
         u.avatar_url   AS shared_by_avatar
    FROM public_projects pp
    LEFT JOIN users u ON u.id = pp.shared_by
   WHERE pp.featured = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_discover_featured_id
  ON mv_discover_featured (id);
CREATE INDEX IF NOT EXISTS idx_mv_discover_featured_popular
  ON mv_discover_featured (view_count DESC, remix_count DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_marketplace_featured AS
  SELECT ml.id, ml.environment_id, ml.publisher_id, ml.category_id,
         ml.title, ml.slug, ml.short_desc, ml.tags, ml.version,
         ml.install_count, ml.avg_rating, ml.review_count, ml.featured,
         ml.published_at, ml.updated_at,
         COALESCE(ml.bundle_format, 'doable.json.v1'::varchar) AS bundle_format,
         ml.bundle_size, ml.bundle_sha256, ml.manifest_summary,
         u.display_name AS publisher_name,
         u.avatar_url   AS publisher_avatar,
         COALESCE(u.is_verified_publisher, false) AS publisher_verified,
         mc.name AS category_name,
         mc.slug AS category_slug,
         mc.icon AS category_icon,
         (COALESCE((SELECT count(*) FROM environment_skill_refs
                     WHERE environment_id = ml.environment_id), 0))::int AS skill_count,
         (COALESCE((SELECT count(*) FROM environment_rule_refs
                     WHERE environment_id = ml.environment_id), 0))::int AS rule_count,
         (COALESCE((SELECT count(*) FROM environment_context_refs
                     WHERE environment_id = ml.environment_id), 0))::int AS knowledge_count,
         (COALESCE((SELECT count(*) FROM environment_connector_refs
                     WHERE environment_id = ml.environment_id), 0))::int AS connector_count
    FROM marketplace_listings ml
    JOIN users u ON u.id = ml.publisher_id
    LEFT JOIN marketplace_categories mc ON mc.id = ml.category_id
   WHERE ml.status::text = 'published' AND ml.featured = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_marketplace_featured_id
  ON mv_marketplace_featured (id);
CREATE INDEX IF NOT EXISTS idx_mv_marketplace_featured_popular
  ON mv_marketplace_featured (install_count DESC, avg_rating DESC);

-- ─── RLS POLICIES not in earlier migrations ────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_self ON notifications;
CREATE POLICY notifications_self ON notifications FOR ALL TO public
  USING (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()
  );

-- ─── SEED DATA: intentionally omitted ──────────────────────
-- The original (lost) migrations also bootstrapped feature_flags (15 rows),
-- mode_tool_config (2 rows), and platform_config (2 rows). Audit confirmed
-- the API code has fallbacks for each:
--   - feature_flags: features/check returns "feature_not_found" when missing,
--     and the only frontend caller (AI Settings page) treats that as
--     fail-open — only "feature_disabled" / "user_override_denied" hard-block.
--   - mode_tool_config: not queried by current API code.
--   - platform_config: admin-frameworks.ts falls back to
--     process.env.DOABLE_ENABLED_FRAMEWORKS or hardcoded "vite-react".
-- Skip the seed to keep the migration schema-only.

-- End of catch-up.
