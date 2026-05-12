use chrono::{DateTime, Utc};
use tokio_postgres::{Client, NoTls};

// ─── Data Models ──────────────────────────────────────────

pub struct UserData {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub is_admin: bool,
    pub platform_role: String, // workspace_role enum: owner|admin|member|viewer
    pub created_at: String,
}

pub struct FlagData {
    pub key: String,
    pub label: String,
    pub enabled: bool,
    pub min_plan: Option<String>,
    pub min_role: Option<String>,
}

pub struct MemberData {
    pub user_id: String,
    pub email: String,
    pub role: String,
    pub workspace_id: String,
    pub workspace: String,
    pub joined: String,
}

pub struct WorkspaceData {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub plan: String,
    pub members: i64,
}

pub struct AiData {
    pub enforce_ai: bool,
    pub enforced_model: Option<String>,
    pub show_model_selector: bool,
    pub default_model: Option<String>,
    pub default_source: String,
    pub default_provider_id: Option<String>,
    pub default_provider_model: Option<String>,
    pub providers: Vec<AiProviderRow>,
}

#[derive(Clone)]
pub struct AiProviderRow {
    pub id: String,
    pub label: String,
    pub provider_type: String,
    pub preset_id: Option<String>,
}

pub struct CreditBalanceRow {
    pub id: String,
    pub user_id: String,
    pub user_email: String,
    pub user_display_name: Option<String>,
    pub workspace_id: String,
    pub workspace_name: String,
    pub daily_credits: i32,
    pub daily_credits_used: i32,
    pub monthly_credits: i32,
    pub monthly_credits_used: i32,
    pub rollover_credits: i32,
    pub plan_type: String,
}

pub const PLAN_TYPES: &[&str] = &["free", "pro", "enterprise"];

// ─── Connection ───────────────────────────────────────────

pub async fn connect(db_url: &str) -> Result<Client, Box<dyn std::error::Error>> {
    let (client, connection) = tokio_postgres::connect(db_url, NoTls).await?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("DB connection error: {e}");
        }
    });
    ensure_schema(&client).await?;
    Ok(client)
}

/// Ensure the columns/tables the admin CLI depends on exist.
/// Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it's safe to re-run.
async fn ensure_schema(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    client
        .batch_execute(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

             CREATE TABLE IF NOT EXISTS feature_flags (
                 feature_key   text        PRIMARY KEY,
                 label         text        NOT NULL,
                 description   text,
                 enabled       boolean     NOT NULL DEFAULT true,
                 min_plan      text,
                 min_role      text,
                 created_at    timestamptz NOT NULL DEFAULT now(),
                 updated_at    timestamptz NOT NULL DEFAULT now()
             );

             CREATE TABLE IF NOT EXISTS user_feature_overrides (
                 user_id       uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                 feature_key   text    NOT NULL REFERENCES feature_flags(feature_key) ON DELETE CASCADE,
                 enabled       boolean NOT NULL,
                 PRIMARY KEY (user_id, feature_key)
             );

             INSERT INTO feature_flags (feature_key, label, description, enabled, min_plan, min_role) VALUES
               ('ai_chat',           'AI Chat',              'AI chat and code generation',                        true,  null,   null),
               ('ai_settings',       'AI Settings',          'Configure AI models, providers, and enforcement',    true,  null,   'admin'),
               ('visual_editor',     'Visual Editor',        'Click-to-edit visual editing in preview',            true,  null,   null),
               ('code_editor',       'Code Editor',          'Monaco code editor (Dev Mode)',                      true,  'pro',  null),
               ('github_sync',       'GitHub Sync',          'Connect and sync projects with GitHub',              true,  null,   null),
               ('publish',           'Publish / Deploy',     'Publish projects to doable.app or custom domains',   true,  null,   null),
               ('custom_domains',    'Custom Domains',       'Use your own domain for published apps',             true,  'pro',  null),
               ('templates',         'Templates',            'Create projects from templates',                     true,  null,   null),
               ('analytics',         'Analytics',            'Built-in analytics for published apps',              true,  null,   null),
               ('billing',           'Billing & Credits',    'Manage subscriptions and credits',                   true,  null,   'owner'),
               ('version_history',   'Version History',      'View and restore previous versions',                 true,  null,   null),
               ('workspaces',        'Workspaces',           'Create and manage workspaces',                       true,  null,   null),
               ('workspace_members', 'Workspace Members',    'Invite and manage workspace members',                true,  null,   'admin'),
               ('connectors',        'Connectors',           'Configure integrations and MCP servers',             true,  'pro',  null),
               ('security_center',   'Security Center',      'Security scanning and vulnerability management',     true,  'business', 'admin')
             ON CONFLICT (feature_key) DO NOTHING;",
        )
        .await?;
    Ok(())
}

// ─── Queries ──────────────────────────────────────────────

pub async fn fetch_users(client: &Client) -> Result<Vec<UserData>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT id::text, email, display_name, is_platform_admin,
                    COALESCE(platform_role::text, 'member') AS platform_role,
                    created_at
             FROM users
             ORDER BY is_platform_admin DESC,
                      CASE platform_role::text
                          WHEN 'owner' THEN 0
                          WHEN 'admin' THEN 1
                          WHEN 'member' THEN 2
                          ELSE 3
                      END,
                      email",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| {
            let created: DateTime<Utc> = r.get("created_at");
            UserData {
                id: r.get("id"),
                email: r.get("email"),
                display_name: r.get::<_, Option<String>>("display_name")
                    .unwrap_or_default(),
                is_admin: r.get("is_platform_admin"),
                platform_role: r.get("platform_role"),
                created_at: created.format("%Y-%m-%d").to_string(),
            }
        })
        .collect())
}

pub async fn toggle_admin(
    client: &Client,
    user_id: &str,
    val: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE users SET is_platform_admin = $1 WHERE id::text = $2",
            &[&val, &user_id],
        )
        .await?;
    Ok(())
}

/// Set the platform_role on a user (workspace_role enum: owner | admin | member | viewer).
/// This is the column that decides "platform owner" — separate from is_platform_admin.
pub async fn set_platform_role(
    client: &Client,
    user_id: &str,
    role: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE users SET platform_role = $1::workspace_role WHERE id::text = $2",
            &[&role, &user_id],
        )
        .await?;
    Ok(())
}

pub async fn fetch_flags(client: &Client) -> Result<Vec<FlagData>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT feature_key, label, enabled, min_plan, min_role
             FROM feature_flags ORDER BY label",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| FlagData {
            key: r.get("feature_key"),
            label: r.get("label"),
            enabled: r.get("enabled"),
            min_plan: r.get("min_plan"),
            min_role: r.get("min_role"),
        })
        .collect())
}

pub async fn toggle_flag(
    client: &Client,
    key: &str,
    val: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE feature_flags SET enabled = $1, updated_at = now()
             WHERE feature_key = $2",
            &[&val, &key],
        )
        .await?;
    Ok(())
}

pub async fn fetch_members(
    client: &Client,
) -> Result<Vec<MemberData>, Box<dyn std::error::Error>> {
    // Cast workspace_role enum to text so tokio-postgres can decode it as String
    // (the `with-uuid-0_8`/`with-chrono-0_4` features don't auto-handle custom enums).
    let rows = client
        .query(
            "SELECT u.id::text as user_id, u.email, wm.role::text as role,
                    w.id::text as workspace_id, w.name as workspace, wm.joined_at
             FROM workspace_members wm
             JOIN users u ON u.id = wm.user_id
             JOIN workspaces w ON w.id = wm.workspace_id
             ORDER BY w.name, wm.role, u.email",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| {
            let joined: DateTime<Utc> = r.get("joined_at");
            MemberData {
                user_id: r.get("user_id"),
                email: r.get("email"),
                role: r.get("role"),
                workspace_id: r.get("workspace_id"),
                workspace: r.get("workspace"),
                joined: joined.format("%Y-%m-%d").to_string(),
            }
        })
        .collect())
}

pub async fn fetch_workspaces(
    client: &Client,
) -> Result<Vec<WorkspaceData>, Box<dyn std::error::Error>> {
    // Cast workspace_plan enum to text so it decodes as String.
    let rows = client
        .query(
            "SELECT w.id::text, w.name, w.slug, w.plan::text as plan,
                    (SELECT count(*) FROM workspace_members wm
                     WHERE wm.workspace_id = w.id) as members
             FROM workspaces w ORDER BY w.name",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| WorkspaceData {
            id: r.get("id"),
            name: r.get("name"),
            slug: r.get("slug"),
            plan: r.get("plan"),
            members: r.get("members"),
        })
        .collect())
}

pub async fn change_role(
    client: &Client,
    workspace_id: &str,
    user_id: &str,
    role: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // Cast text param to workspace_role enum.
    client
        .execute(
            "UPDATE workspace_members SET role = $1::workspace_role
             WHERE workspace_id::text = $2 AND user_id::text = $3",
            &[&role, &workspace_id, &user_id],
        )
        .await?;
    Ok(())
}

pub async fn find_user_by_email(
    client: &Client,
    email: &str,
) -> Result<Option<String>, Box<dyn std::error::Error>> {
    let rows = client
        .query("SELECT id::text FROM users WHERE email = $1", &[&email])
        .await?;
    Ok(rows.first().map(|r| r.get("id")))
}

pub async fn is_already_member(
    client: &Client,
    workspace_id: &str,
    user_id: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT 1 FROM workspace_members
             WHERE workspace_id::text = $1 AND user_id::text = $2",
            &[&workspace_id, &user_id],
        )
        .await?;
    Ok(!rows.is_empty())
}

pub async fn add_member(
    client: &Client,
    workspace_id: &str,
    user_id: &str,
    role: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "INSERT INTO workspace_members (workspace_id, user_id, role)
             VALUES (($1::text)::uuid, ($2::text)::uuid, $3::workspace_role)",
            &[&workspace_id, &user_id, &role],
        )
        .await?;
    Ok(())
}

pub async fn remove_member(
    client: &Client,
    workspace_id: &str,
    user_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "DELETE FROM workspace_members
             WHERE workspace_id::text = $1 AND user_id::text = $2",
            &[&workspace_id, &user_id],
        )
        .await?;
    Ok(())
}

pub async fn fetch_ai_settings(
    client: &Client,
    workspace_id: &str,
) -> Result<Option<AiData>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT enforce_ai, enforced_model, show_model_selector, default_model,
                    default_source, default_provider_id::text AS default_provider_id,
                    default_provider_model
             FROM workspace_ai_settings WHERE workspace_id::text = $1",
            &[&workspace_id],
        )
        .await?;
    let providers = fetch_workspace_providers(client, workspace_id)
        .await
        .unwrap_or_default();
    Ok(rows.first().map(|r| AiData {
        enforce_ai: r.get("enforce_ai"),
        enforced_model: r.get("enforced_model"),
        show_model_selector: r.get("show_model_selector"),
        default_model: r.get("default_model"),
        default_source: r.get("default_source"),
        default_provider_id: r.get("default_provider_id"),
        default_provider_model: r.get("default_provider_model"),
        providers: providers.clone(),
    }))
}

pub async fn fetch_workspace_providers(
    client: &Client,
    workspace_id: &str,
) -> Result<Vec<AiProviderRow>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT id::text AS id, label, provider_type::text AS provider_type, preset_id
             FROM ai_providers
             WHERE workspace_id::text = $1 AND is_valid = true
             ORDER BY label",
            &[&workspace_id],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| AiProviderRow {
            id: r.get("id"),
            label: r.get("label"),
            provider_type: r.get("provider_type"),
            preset_id: r.get("preset_id"),
        })
        .collect())
}

pub async fn set_default_provider(
    client: &Client,
    workspace_id: &str,
    provider_id: Option<&str>,
    model: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Insert if missing, otherwise update — keep enforce/show flags at their existing
    // defaults if a fresh row is created.
    client
        .execute(
            "INSERT INTO workspace_ai_settings
                (workspace_id, default_source, default_provider_id, default_provider_model)
             VALUES (($1::text)::uuid, 'custom',
                     CASE WHEN $2::text IS NULL THEN NULL ELSE ($2::text)::uuid END,
                     $3)
             ON CONFLICT (workspace_id) DO UPDATE SET
                default_source = 'custom',
                default_provider_id = CASE WHEN $2::text IS NULL THEN NULL ELSE ($2::text)::uuid END,
                default_provider_model = $3,
                updated_at = now()",
            &[&workspace_id, &provider_id, &model],
        )
        .await?;
    Ok(())
}

pub async fn set_ai_enforcement(
    client: &Client,
    workspace_id: &str,
    val: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE workspace_ai_settings SET enforce_ai = $1
             WHERE workspace_id::text = $2",
            &[&val, &workspace_id],
        )
        .await?;
    Ok(())
}

pub async fn set_model_selector(
    client: &Client,
    workspace_id: &str,
    val: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE workspace_ai_settings SET show_model_selector = $1
             WHERE workspace_id::text = $2",
            &[&val, &workspace_id],
        )
        .await?;
    Ok(())
}

pub async fn fetch_credit_balances(
    client: &Client,
) -> Result<Vec<CreditBalanceRow>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT cb.id::text AS id,
                    cb.user_id::text AS user_id,
                    u.email AS user_email,
                    u.display_name AS user_display_name,
                    cb.workspace_id::text AS workspace_id,
                    w.name AS workspace_name,
                    cb.daily_credits,
                    cb.daily_credits_used,
                    cb.monthly_credits,
                    cb.monthly_credits_used,
                    cb.rollover_credits,
                    cb.plan_type
             FROM credit_balances cb
             JOIN users u ON u.id = cb.user_id
             JOIN workspaces w ON w.id = cb.workspace_id
             ORDER BY u.email, w.name",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| CreditBalanceRow {
            id: r.get("id"),
            user_id: r.get("user_id"),
            user_email: r.get("user_email"),
            user_display_name: r.get::<_, Option<String>>("user_display_name"),
            workspace_id: r.get("workspace_id"),
            workspace_name: r.get("workspace_name"),
            daily_credits: r.get("daily_credits"),
            daily_credits_used: r.get("daily_credits_used"),
            monthly_credits: r.get("monthly_credits"),
            monthly_credits_used: r.get("monthly_credits_used"),
            rollover_credits: r.get("rollover_credits"),
            plan_type: r.get("plan_type"),
        })
        .collect())
}

pub async fn set_credit_balance(
    client: &Client,
    balance_id: &str,
    daily: i32,
    monthly: i32,
    rollover: i32,
    plan_type: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE credit_balances
             SET daily_credits = $1,
                 monthly_credits = $2,
                 rollover_credits = $3,
                 plan_type = $4,
                 updated_at = now()
             WHERE id::text = $5",
            &[&daily, &monthly, &rollover, &plan_type, &balance_id],
        )
        .await?;
    Ok(())
}

// ─── API Keys ─────────────────────────────────────────────

pub struct ApiKeyRow {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub label: Option<String>,
    pub prefix: String,
    pub tier: String,
    pub allowed_tools: Vec<String>,
    pub allowed_origins: Vec<String>,
}

fn json_text_to_string_vec(s: Option<String>) -> Vec<String> {
    let raw = match s {
        Some(s) => s,
        None => return Vec::new(),
    };
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(serde_json::Value::Array(arr)) => arr
            .into_iter()
            .filter_map(|x| match x {
                serde_json::Value::String(s) => Some(s),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

pub async fn fetch_api_keys(
    client: &Client,
) -> Result<Vec<ApiKeyRow>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT k.id::text AS id,
                    k.project_id::text AS project_id,
                    p.name AS project_name,
                    k.label,
                    k.prefix,
                    k.tier,
                    k.allowed_tools::text  AS allowed_tools_text,
                    k.allowed_origins::text AS allowed_origins_text
             FROM project_api_keys k
             JOIN projects p ON p.id = k.project_id
             ORDER BY p.name, k.prefix",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| {
            let tools_t: Option<String> = r.get("allowed_tools_text");
            let origins_t: Option<String> = r.get("allowed_origins_text");
            ApiKeyRow {
                id: r.get("id"),
                project_id: r.get("project_id"),
                project_name: r.get("project_name"),
                label: r.get::<_, Option<String>>("label"),
                prefix: r.get("prefix"),
                tier: r.get("tier"),
                allowed_tools: json_text_to_string_vec(tools_t),
                allowed_origins: json_text_to_string_vec(origins_t),
            }
        })
        .collect())
}

pub async fn set_api_key_origins(
    client: &Client,
    key_id: &str,
    origins: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::Value::Array(
        origins
            .iter()
            .map(|s| serde_json::Value::String(s.clone()))
            .collect(),
    );
    let json_str = serde_json::to_string(&json)?;
    client
        .execute(
            "UPDATE project_api_keys
             SET allowed_origins = $1::jsonb
             WHERE id::text = $2",
            &[&json_str, &key_id],
        )
        .await?;
    Ok(())
}

pub async fn set_api_key_tools(
    client: &Client,
    key_id: &str,
    tools: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::Value::Array(
        tools
            .iter()
            .map(|s| serde_json::Value::String(s.clone()))
            .collect(),
    );
    let json_str = serde_json::to_string(&json)?;
    client
        .execute(
            "UPDATE project_api_keys
             SET allowed_tools = $1::jsonb
             WHERE id::text = $2",
            &[&json_str, &key_id],
        )
        .await?;
    Ok(())
}

// ─── Mode Tools ───────────────────────────────────────────

pub struct ModeToolsRow {
    pub mode: String,
    pub allowed_tools: Vec<String>,
    pub description: Option<String>,
}

pub async fn fetch_mode_tools(
    client: &Client,
) -> Result<Vec<ModeToolsRow>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT mode, allowed_tools, description
             FROM mode_tools ORDER BY mode",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| ModeToolsRow {
            mode: r.get("mode"),
            allowed_tools: r
                .get::<_, Option<Vec<String>>>("allowed_tools")
                .unwrap_or_default(),
            description: r.get::<_, Option<String>>("description"),
        })
        .collect())
}

pub async fn set_mode_tools(
    client: &Client,
    mode: &str,
    tools: &[String],
    updated_by: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    let tools_owned: Vec<String> = tools.to_vec();
    if let Some(uid) = updated_by {
        client
            .execute(
                "UPDATE mode_tools
                 SET allowed_tools = $1,
                     updated_by = ($2::text)::uuid,
                     updated_at = now()
                 WHERE mode = $3",
                &[&tools_owned, &uid, &mode],
            )
            .await?;
    } else {
        client
            .execute(
                "UPDATE mode_tools
                 SET allowed_tools = $1,
                     updated_at = now()
                 WHERE mode = $2",
                &[&tools_owned, &mode],
            )
            .await?;
    }
    Ok(())
}

// ─── Sandbox ──────────────────────────────────────────────
//
// Read-only first pass. Each loader swallows the Postgres "undefined_table"
// error (SQLSTATE 42P01) so the screen still renders on installations that
// haven't applied the sandbox migrations yet — instead returning an empty Vec
// or default settings row.

#[derive(Debug, Default, Clone)]
pub struct SandboxSettingsRow {
    pub workspace_id: String,
    pub sandbox_backend: Option<String>,
    pub allowed_profile_keys: Vec<String>,
    pub tool_default_action: Option<String>,
    pub network_default_action: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SandboxRulesRow {
    pub id: String,
    pub rule_type: String,
    pub pattern: String,
    pub action: String,
    pub priority: i32,
    pub enabled: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SandboxAuditRow {
    pub started_at: DateTime<Utc>,
    pub profile_key: String,
    pub backend_id: String,
    pub command: String,
    pub exit_code: Option<i32>,
    pub oom_killed: bool,
    pub timed_out: bool,
    pub duration_ms: Option<i32>,
}

/// True if the given DB error is "relation does not exist" (42P01).
fn is_missing_relation(err: &tokio_postgres::Error) -> bool {
    err.as_db_error()
        .map(|d| d.code().code() == "42P01")
        .unwrap_or(false)
}

pub async fn load_sandbox_settings(
    client: &Client,
    workspace_id: &str,
) -> Result<Option<SandboxSettingsRow>, Box<dyn std::error::Error>> {
    let res = client
        .query_opt(
            "SELECT workspace_id::text, sandbox_backend, allowed_profile_keys,
                    tool_default_action, network_default_action
             FROM workspace_sandbox_settings
             WHERE workspace_id::text = $1",
            &[&workspace_id],
        )
        .await;
    match res {
        Ok(Some(r)) => Ok(Some(SandboxSettingsRow {
            workspace_id: r.get("workspace_id"),
            sandbox_backend: r.get::<_, Option<String>>("sandbox_backend"),
            allowed_profile_keys: r
                .get::<_, Option<Vec<String>>>("allowed_profile_keys")
                .unwrap_or_default(),
            tool_default_action: r.get::<_, Option<String>>("tool_default_action"),
            network_default_action: r.get::<_, Option<String>>("network_default_action"),
        })),
        Ok(None) => Ok(None),
        Err(e) if is_missing_relation(&e) => Ok(None),
        Err(e) => Err(Box::new(e)),
    }
}

pub async fn load_sandbox_rules(
    client: &Client,
    workspace_id: &str,
) -> Result<Vec<SandboxRulesRow>, Box<dyn std::error::Error>> {
    let res = client
        .query(
            "SELECT id::text, rule_type, pattern, action, priority, enabled, reason
             FROM workspace_sandbox_rules
             WHERE workspace_id::text = $1
             ORDER BY priority DESC, rule_type, pattern",
            &[&workspace_id],
        )
        .await;
    match res {
        Ok(rows) => Ok(rows
            .iter()
            .map(|r| SandboxRulesRow {
                id: r.get("id"),
                rule_type: r.get("rule_type"),
                pattern: r.get("pattern"),
                action: r.get("action"),
                priority: r.get::<_, i32>("priority"),
                enabled: r.get::<_, bool>("enabled"),
                reason: r.get::<_, Option<String>>("reason"),
            })
            .collect()),
        Err(e) if is_missing_relation(&e) => Ok(Vec::new()),
        Err(e) => Err(Box::new(e)),
    }
}

pub async fn load_sandbox_audit(
    client: &Client,
    workspace_id: &str,
) -> Result<Vec<SandboxAuditRow>, Box<dyn std::error::Error>> {
    let res = client
        .query(
            "SELECT started_at, profile_key, backend_id, command,
                    exit_code, oom_killed, timed_out, duration_ms
             FROM audit_sandbox_spawn
             WHERE workspace_id::text = $1
             ORDER BY started_at DESC
             LIMIT 20",
            &[&workspace_id],
        )
        .await;
    match res {
        Ok(rows) => Ok(rows
            .iter()
            .map(|r| SandboxAuditRow {
                started_at: r.get("started_at"),
                profile_key: r.get("profile_key"),
                backend_id: r.get("backend_id"),
                command: r.get("command"),
                exit_code: r.get::<_, Option<i32>>("exit_code"),
                oom_killed: r.get::<_, bool>("oom_killed"),
                timed_out: r.get::<_, bool>("timed_out"),
                duration_ms: r.get::<_, Option<i32>>("duration_ms"),
            })
            .collect()),
        Err(e) if is_missing_relation(&e) => Ok(Vec::new()),
        Err(e) => Err(Box::new(e)),
    }
}

// ─── Sandbox write operations ─────────────────────────────

/// Insert a new sandbox rule. Returns the generated UUID.
pub async fn insert_sandbox_rule(
    client: &Client,
    workspace_id: &str,
    rule_type: &str,
    pattern: &str,
    action: &str,
    priority: i32,
    reason: Option<&str>,
) -> Result<String, Box<dyn std::error::Error>> {
    let row = client
        .query_one(
            "INSERT INTO workspace_sandbox_rules
                (workspace_id, rule_type, pattern, action, priority, enabled, reason)
             VALUES ($1::uuid, $2, $3, $4, $5, true, $6)
             RETURNING id::text",
            &[&workspace_id, &rule_type, &pattern, &action, &priority, &reason],
        )
        .await?;
    Ok(row.get::<_, String>("id"))
}

/// Update an existing sandbox rule.
pub async fn update_sandbox_rule(
    client: &Client,
    rule_id: &str,
    rule_type: &str,
    pattern: &str,
    action: &str,
    priority: i32,
    reason: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE workspace_sandbox_rules
             SET rule_type = $2, pattern = $3, action = $4,
                 priority = $5, reason = $6, updated_at = now()
             WHERE id::text = $1",
            &[&rule_id, &rule_type, &pattern, &action, &priority, &reason],
        )
        .await?;
    Ok(())
}

/// Toggle the enabled/disabled state of a sandbox rule.
pub async fn toggle_sandbox_rule(
    client: &Client,
    rule_id: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let row = client
        .query_one(
            "UPDATE workspace_sandbox_rules
             SET enabled = NOT enabled, updated_at = now()
             WHERE id::text = $1
             RETURNING enabled",
            &[&rule_id],
        )
        .await?;
    Ok(row.get::<_, bool>("enabled"))
}

/// Delete a sandbox rule.
pub async fn delete_sandbox_rule(
    client: &Client,
    rule_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "DELETE FROM workspace_sandbox_rules WHERE id::text = $1",
            &[&rule_id],
        )
        .await?;
    Ok(())
}

/// Upsert workspace sandbox settings (backend, profiles, default actions).
pub async fn upsert_sandbox_settings(
    client: &Client,
    workspace_id: &str,
    sandbox_backend: Option<&str>,
    tool_default_action: Option<&str>,
    network_default_action: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "INSERT INTO workspace_sandbox_settings
                (workspace_id, sandbox_backend, tool_default_action, network_default_action)
             VALUES ($1::uuid, $2, $3, $4)
             ON CONFLICT (workspace_id) DO UPDATE SET
                sandbox_backend = EXCLUDED.sandbox_backend,
                tool_default_action = EXCLUDED.tool_default_action,
                network_default_action = EXCLUDED.network_default_action,
                updated_at = now()",
            &[&workspace_id, &sandbox_backend, &tool_default_action, &network_default_action],
        )
        .await?;
    Ok(())
}

// ─── System-level sandbox rules (Migration 080) ───────────────────────

#[derive(Debug, Clone)]
pub struct SystemRuleRow {
    pub id: String,
    pub scope: String,
    pub rule_type: String,
    pub pattern: String,
    pub action: String,
    pub priority: i32,
    pub is_floor: bool,
    pub enabled: bool,
    pub description: Option<String>,
}

/// Load all system-level sandbox rules, ordered by scope/type/priority.
pub async fn load_system_rules(
    client: &Client,
) -> Result<Vec<SystemRuleRow>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT id, scope, rule_type, pattern, action, priority, is_floor, enabled,
                    description
             FROM sandbox_system_rules
             ORDER BY scope, rule_type, priority ASC, created_at ASC",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| {
            let id: uuid::Uuid = r.get("id");
            SystemRuleRow {
                id: id.to_string(),
                scope: r.get("scope"),
                rule_type: r.get("rule_type"),
                pattern: r.get("pattern"),
                action: r.get("action"),
                priority: r.get("priority"),
                is_floor: r.get("is_floor"),
                enabled: r.get("enabled"),
                description: r.get("description"),
            }
        })
        .collect())
}

/// Insert a new system-level sandbox rule. Returns the new UUID.
pub async fn insert_system_rule(
    client: &Client,
    scope: &str,
    rule_type: &str,
    pattern: &str,
    action: &str,
    priority: i32,
    is_floor: bool,
    description: Option<&str>,
) -> Result<String, Box<dyn std::error::Error>> {
    let row = client
        .query_one(
            "INSERT INTO sandbox_system_rules
                (scope, rule_type, pattern, action, priority, is_floor, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id",
            &[&scope, &rule_type, &pattern, &action, &priority, &is_floor, &description],
        )
        .await?;
    let id: uuid::Uuid = row.get("id");
    Ok(id.to_string())
}

/// Update an existing system-level sandbox rule.
pub async fn update_system_rule(
    client: &Client,
    rule_id: &str,
    scope: &str,
    rule_type: &str,
    pattern: &str,
    action: &str,
    priority: i32,
    is_floor: bool,
    description: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    let id = uuid::Uuid::parse_str(rule_id)?;
    client
        .execute(
            "UPDATE sandbox_system_rules
             SET scope = $2, rule_type = $3, pattern = $4, action = $5,
                 priority = $6, is_floor = $7, description = $8, updated_at = now()
             WHERE id = $1",
            &[&id, &scope, &rule_type, &pattern, &action, &priority, &is_floor, &description],
        )
        .await?;
    Ok(())
}

/// Toggle a system-level sandbox rule enabled/disabled. Returns new state.
pub async fn toggle_system_rule(
    client: &Client,
    rule_id: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let id = uuid::Uuid::parse_str(rule_id)?;
    let row = client
        .query_one(
            "UPDATE sandbox_system_rules
             SET enabled = NOT enabled, updated_at = now()
             WHERE id = $1
             RETURNING enabled",
            &[&id],
        )
        .await?;
    Ok(row.get("enabled"))
}

/// Delete a system-level sandbox rule.
pub async fn delete_system_rule(
    client: &Client,
    rule_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let id = uuid::Uuid::parse_str(rule_id)?;
    client
        .execute(
            "DELETE FROM sandbox_system_rules WHERE id = $1",
            &[&id],
        )
        .await?;
    Ok(())
}
