use chrono::NaiveDateTime;
use colored::Colorize;
use inquire::{Select, Text};
use tabled::{Table, Tabled};
use tokio_postgres::{Client, NoTls};

// ─── Data Models ───────────────────────────────────────────

#[derive(Tabled, Clone)]
struct UserRow {
    #[tabled(rename = "Email")]
    email: String,
    #[tabled(rename = "Role")]
    role: String,
    #[tabled(rename = "Workspace")]
    workspace: String,
    #[tabled(rename = "Joined")]
    joined: String,
}

#[derive(Tabled, Clone)]
struct WorkspaceRow {
    #[tabled(rename = "ID")]
    id: String,
    #[tabled(rename = "Name")]
    name: String,
    #[tabled(rename = "Slug")]
    slug: String,
    #[tabled(rename = "Plan")]
    plan: String,
    #[tabled(rename = "Members")]
    members: i64,
}

#[derive(Tabled)]
struct AiSettingsRow {
    #[tabled(rename = "Setting")]
    setting: String,
    #[tabled(rename = "Value")]
    value: String,
}

// ─── Database ──────────────────────────────────────────────

async fn connect(db_url: &str) -> Result<Client, Box<dyn std::error::Error>> {
    let (client, connection) = tokio_postgres::connect(db_url, NoTls).await?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("DB connection error: {e}");
        }
    });
    Ok(client)
}

async fn list_members(client: &Client) -> Result<Vec<UserRow>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT u.email, wm.role, w.name as workspace, wm.joined_at
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
            let joined: Option<NaiveDateTime> = r.get::<_, Option<NaiveDateTime>>("joined_at");
            UserRow {
                email: r.get("email"),
                role: colorize_role(r.get("role")),
                workspace: r.get("workspace"),
                joined: joined
                    .map(|j| j.format("%Y-%m-%d").to_string())
                    .unwrap_or_default(),
            }
        })
        .collect())
}

async fn list_workspaces(client: &Client) -> Result<Vec<WorkspaceRow>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT w.id::text, w.name, w.slug, w.plan,
                    (SELECT count(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) as members
             FROM workspaces w ORDER BY w.name",
            &[],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|r| WorkspaceRow {
            id: r.get("id"),
            name: r.get("name"),
            slug: r.get("slug"),
            plan: r.get("plan"),
            members: r.get("members"),
        })
        .collect())
}

fn colorize_role(role: &str) -> String {
    match role {
        "owner" => "owner".bright_yellow().bold().to_string(),
        "admin" => "admin".bright_cyan().bold().to_string(),
        "member" => "member".green().to_string(),
        "viewer" => "viewer".dimmed().to_string(),
        _ => role.to_string(),
    }
}

// ─── Actions ───────────────────────────────────────────────

async fn action_list_members(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let members = list_members(client).await?;
    if members.is_empty() {
        println!("\n  {}", "No members found.".dimmed());
    } else {
        println!("\n{}", Table::new(&members));
    }
    Ok(())
}

async fn action_change_role(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT u.id::text as user_id, u.email, wm.role,
                    w.id::text as workspace_id, w.name as workspace
             FROM workspace_members wm
             JOIN users u ON u.id = wm.user_id
             JOIN workspaces w ON w.id = wm.workspace_id
             ORDER BY w.name, u.email",
            &[],
        )
        .await?;

    if rows.is_empty() {
        println!("\n  {}", "No members found.".dimmed());
        return Ok(());
    }

    let options: Vec<String> = rows
        .iter()
        .map(|r| {
            format!(
                "{} [{}] — {}",
                r.get::<_, String>("email"),
                r.get::<_, String>("workspace"),
                r.get::<_, String>("role")
            )
        })
        .collect();

    let choice = Select::new("Select member:", options.clone()).prompt()?;
    let idx = options.iter().position(|o| o == &choice).unwrap();
    let row = &rows[idx];
    let current_role: String = row.get("role");

    let new_role = Select::new(
        &format!("New role (current: {current_role}):"),
        vec!["owner", "admin", "member", "viewer"],
    )
    .prompt()?;

    if new_role == current_role {
        println!("  {}", "Role unchanged.".dimmed());
        return Ok(());
    }

    let user_id: String = row.get("user_id");
    let workspace_id: String = row.get("workspace_id");

    client
        .execute(
            "UPDATE workspace_members SET role = $1
             WHERE workspace_id = $2::uuid AND user_id = $3::uuid",
            &[&new_role, &workspace_id, &user_id],
        )
        .await?;

    println!(
        "\n  {} {} is now {}",
        "✓".green(),
        row.get::<_, String>("email"),
        colorize_role(new_role)
    );
    Ok(())
}

async fn action_add_member(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let workspaces = list_workspaces(client).await?;
    if workspaces.is_empty() {
        println!("\n  {}", "No workspaces found.".dimmed());
        return Ok(());
    }

    let ws_opts: Vec<String> = workspaces.iter().map(|w| format!("{} ({})", w.name, w.slug)).collect();
    let ws_choice = Select::new("Workspace:", ws_opts.clone()).prompt()?;
    let ws_idx = ws_opts.iter().position(|o| o == &ws_choice).unwrap();
    let workspace_id = &workspaces[ws_idx].id;

    let email = Text::new("User email:").prompt()?;

    let user_rows = client
        .query("SELECT id::text FROM users WHERE email = $1", &[&email])
        .await?;

    if user_rows.is_empty() {
        println!(
            "\n  {} '{}' not found — they must sign up first.",
            "✗".red(),
            email
        );
        return Ok(());
    }
    let user_id: String = user_rows[0].get("id");

    let existing = client
        .query(
            "SELECT 1 FROM workspace_members
             WHERE workspace_id = $1::uuid AND user_id = $2::uuid",
            &[&workspace_id, &user_id],
        )
        .await?;

    if !existing.is_empty() {
        println!("\n  {} '{}' is already a member.", "!".yellow(), email);
        return Ok(());
    }

    let role = Select::new("Role:", vec!["admin", "member", "viewer"]).prompt()?;

    client
        .execute(
            "INSERT INTO workspace_members (workspace_id, user_id, role)
             VALUES ($1::uuid, $2::uuid, $3)",
            &[&workspace_id, &user_id, &role],
        )
        .await?;

    println!(
        "\n  {} Added {} as {}",
        "✓".green(),
        email,
        colorize_role(role)
    );
    Ok(())
}

async fn action_remove_member(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT u.id::text as user_id, u.email, wm.role,
                    w.id::text as workspace_id, w.name as workspace
             FROM workspace_members wm
             JOIN users u ON u.id = wm.user_id
             JOIN workspaces w ON w.id = wm.workspace_id
             WHERE wm.role != 'owner'
             ORDER BY w.name, u.email",
            &[],
        )
        .await?;

    if rows.is_empty() {
        println!(
            "\n  {}",
            "No removable members (owners cannot be removed).".dimmed()
        );
        return Ok(());
    }

    let options: Vec<String> = rows
        .iter()
        .map(|r| {
            format!(
                "{} [{}] — {}",
                r.get::<_, String>("email"),
                r.get::<_, String>("workspace"),
                r.get::<_, String>("role")
            )
        })
        .collect();

    let choice = Select::new("Remove member:", options.clone()).prompt()?;
    let idx = options.iter().position(|o| o == &choice).unwrap();
    let row = &rows[idx];

    let confirm = Select::new(
        &format!(
            "Remove {} from {}?",
            row.get::<_, String>("email"),
            row.get::<_, String>("workspace")
        ),
        vec!["No", "Yes, remove"],
    )
    .prompt()?;

    if confirm == "No" {
        println!("  {}", "Cancelled.".dimmed());
        return Ok(());
    }

    let user_id: String = row.get("user_id");
    let workspace_id: String = row.get("workspace_id");

    client
        .execute(
            "DELETE FROM workspace_members
             WHERE workspace_id = $1::uuid AND user_id = $2::uuid",
            &[&workspace_id, &user_id],
        )
        .await?;

    println!(
        "\n  {} Removed {}",
        "✓".green(),
        row.get::<_, String>("email")
    );
    Ok(())
}

// ─── Platform Admin Actions ───────────────────────────────

async fn action_list_platform_admins(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT email, display_name, is_platform_admin, created_at
             FROM users ORDER BY is_platform_admin DESC, email",
            &[],
        )
        .await?;

    if rows.is_empty() {
        println!("\n  {}", "No users found.".dimmed());
        return Ok(());
    }

    println!("\n  {}", "Platform Users".bold().underline());
    for r in &rows {
        let email: String = r.get("email");
        let name: Option<String> = r.get("display_name");
        let is_admin: bool = r.get("is_platform_admin");
        let label = name.unwrap_or_else(|| email.split('@').next().unwrap_or("").to_string());

        if is_admin {
            println!(
                "  {} {} {} {}",
                "★".bright_yellow(),
                label.bright_white().bold(),
                format!("<{email}>").dimmed(),
                "PLATFORM ADMIN".bright_yellow().bold()
            );
        } else {
            println!(
                "    {} {}",
                label.white(),
                format!("<{email}>").dimmed(),
            );
        }
    }
    Ok(())
}

async fn action_toggle_platform_admin(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT id::text, email, display_name, is_platform_admin FROM users ORDER BY email",
            &[],
        )
        .await?;

    if rows.is_empty() {
        println!("\n  {}", "No users found.".dimmed());
        return Ok(());
    }

    let options: Vec<String> = rows
        .iter()
        .map(|r| {
            let email: String = r.get("email");
            let is_admin: bool = r.get("is_platform_admin");
            if is_admin {
                format!("{email}  ★ ADMIN")
            } else {
                email
            }
        })
        .collect();

    let choice = Select::new("Select user:", options.clone()).prompt()?;
    let idx = options.iter().position(|o| o == &choice).unwrap();
    let row = &rows[idx];
    let user_id: String = row.get("id");
    let email: String = row.get("email");
    let is_admin: bool = row.get("is_platform_admin");

    let action = if is_admin {
        Select::new(
            &format!("Revoke platform admin from {email}?"),
            vec!["No", "Yes, revoke"],
        )
        .prompt()?
    } else {
        Select::new(
            &format!("Grant platform admin to {email}?"),
            vec!["No", "Yes, grant"],
        )
        .prompt()?
    };

    if action == "No" {
        println!("  {}", "Cancelled.".dimmed());
        return Ok(());
    }

    let new_val = !is_admin;
    client
        .execute(
            "UPDATE users SET is_platform_admin = $1 WHERE id = $2::uuid",
            &[&new_val, &user_id],
        )
        .await?;

    if new_val {
        println!("\n  {} {} is now a {}", "✓".green(), email, "platform admin".bright_yellow().bold());
    } else {
        println!("\n  {} {} platform admin access {}", "✓".green(), email, "revoked".red());
    }
    Ok(())
}

async fn action_manage_feature_flags(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT feature_key, label, enabled, min_plan, min_role FROM feature_flags ORDER BY label",
            &[],
        )
        .await?;

    if rows.is_empty() {
        println!("\n  {}", "No feature flags found. Run migration 012.".dimmed());
        return Ok(());
    }

    // Display current flags
    println!("\n  {}", "Feature Flags".bold().underline());
    for r in &rows {
        let key: String = r.get("feature_key");
        let label: String = r.get("label");
        let enabled: bool = r.get("enabled");
        let min_plan: Option<String> = r.get("min_plan");
        let min_role: Option<String> = r.get("min_role");

        let status = if enabled { "ON".green().bold().to_string() } else { "OFF".red().bold().to_string() };
        let restrictions = match (min_plan.as_deref(), min_role.as_deref()) {
            (Some(p), Some(r)) => format!(" [{}+ / {}+]", p, r).dimmed().to_string(),
            (Some(p), None) => format!(" [{}+]", p).dimmed().to_string(),
            (None, Some(r)) => format!(" [{}+]", r).dimmed().to_string(),
            (None, None) => String::new(),
        };

        println!("  {} {:<25} {}{}", status, label, key.dimmed(), restrictions);
    }

    // Select a flag to toggle
    let options: Vec<String> = rows
        .iter()
        .map(|r| {
            let label: String = r.get("label");
            let enabled: bool = r.get("enabled");
            format!("{} {label}", if enabled { "ON " } else { "OFF" })
        })
        .collect();

    let mut opts_with_back = options.clone();
    opts_with_back.push("Back".to_string());

    let choice = Select::new("Toggle feature:", opts_with_back.clone()).prompt()?;
    if choice == "Back" {
        return Ok(());
    }

    let idx = options.iter().position(|o| o == &choice).unwrap();
    let row = &rows[idx];
    let key: String = row.get("feature_key");
    let enabled: bool = row.get("enabled");
    let new_val = !enabled;

    client
        .execute(
            "UPDATE feature_flags SET enabled = $1, updated_at = now() WHERE feature_key = $2",
            &[&new_val, &key],
        )
        .await?;

    let label: String = row.get("label");
    println!(
        "\n  {} {} is now {}",
        "✓".green(),
        label,
        if new_val { "ON".green().bold().to_string() } else { "OFF".red().bold().to_string() }
    );
    Ok(())
}

async fn action_ai_settings(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let workspaces = list_workspaces(client).await?;
    if workspaces.is_empty() {
        println!("\n  {}", "No workspaces found.".dimmed());
        return Ok(());
    }

    let ws_opts: Vec<String> = workspaces.iter().map(|w| format!("{} ({})", w.name, w.slug)).collect();
    let ws_choice = Select::new("Workspace:", ws_opts.clone()).prompt()?;
    let ws_idx = ws_opts.iter().position(|o| o == &ws_choice).unwrap();
    let workspace_id = &workspaces[ws_idx].id;

    let settings_rows = client
        .query(
            "SELECT enforce_ai, enforced_model, show_model_selector,
                    default_model
             FROM workspace_ai_settings WHERE workspace_id = $1::uuid",
            &[&workspace_id],
        )
        .await?;

    if settings_rows.is_empty() {
        println!("\n  {}", "No AI settings for this workspace.".dimmed());
        return Ok(());
    }

    let s = &settings_rows[0];
    let enforce_ai: bool = s.get("enforce_ai");
    let show_selector: bool = s.get("show_model_selector");
    let enforced_model: Option<String> = s.get("enforced_model");
    let default_model: Option<String> = s.get("default_model");

    let settings = vec![
        AiSettingsRow {
            setting: "Enforce AI model".into(),
            value: if enforce_ai {
                format!("ON ({})", enforced_model.as_deref().unwrap_or("none"))
            } else {
                "OFF — users choose their own".into()
            },
        },
        AiSettingsRow {
            setting: "Show model selector".into(),
            value: if show_selector {
                "Visible".into()
            } else {
                "Hidden".into()
            },
        },
        AiSettingsRow {
            setting: "Default model".into(),
            value: default_model.unwrap_or_else(|| "not set".into()),
        },
    ];

    println!("\n{}", Table::new(&settings));

    let action = Select::new(
        "Action:",
        vec![
            "Toggle enforcement (lock all users to one model)",
            "Toggle model selector visibility",
            "Back",
        ],
    )
    .prompt()?;

    match action {
        "Toggle enforcement (lock all users to one model)" => {
            let new_val = !enforce_ai;
            client
                .execute(
                    "UPDATE workspace_ai_settings SET enforce_ai = $1
                     WHERE workspace_id = $2::uuid",
                    &[&new_val, &workspace_id],
                )
                .await?;
            println!(
                "\n  {} Enforcement: {}",
                "✓".green(),
                if new_val { "ON" } else { "OFF" }
            );
        }
        "Toggle model selector visibility" => {
            let new_val = !show_selector;
            client
                .execute(
                    "UPDATE workspace_ai_settings SET show_model_selector = $1
                     WHERE workspace_id = $2::uuid",
                    &[&new_val, &workspace_id],
                )
                .await?;
            println!(
                "\n  {} Model selector: {}",
                "✓".green(),
                if new_val { "Visible" } else { "Hidden" }
            );
        }
        _ => {}
    }

    Ok(())
}

// ─── Main ──────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env from project root
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(".env");
    if env_path.exists() {
        dotenvy::from_path(&env_path).ok();
    }

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://doable:doable@localhost:5432/doable".into());

    println!(
        "\n{}",
        "  ╔════════════════════════════════════════╗".bright_blue()
    );
    println!(
        "{}",
        "  ║     Doable Admin — System Management   ║".bright_blue()
    );
    println!(
        "{}",
        "  ╚════════════════════════════════════════╝".bright_blue()
    );
    println!(
        "  {}\n",
        format!(
            "DB: {}",
            db_url.split('@').last().unwrap_or(&db_url)
        )
        .dimmed()
    );

    let client = connect(&db_url).await?;

    loop {
        let choices = vec![
            "── Platform ──────────────",
            "  Platform admins",
            "  Grant/revoke platform admin",
            "  Feature flags",
            "── Workspaces ────────────",
            "  List all members & roles",
            "  Change a member's role",
            "  Add member to workspace",
            "  Remove member from workspace",
            "  AI settings & enforcement",
            "Exit",
        ];

        let action = Select::new("doable-admin >", choices).prompt()?;

        match action {
            "  Platform admins" => action_list_platform_admins(&client).await?,
            "  Grant/revoke platform admin" => action_toggle_platform_admin(&client).await?,
            "  Feature flags" => action_manage_feature_flags(&client).await?,
            "  List all members & roles" => action_list_members(&client).await?,
            "  Change a member's role" => action_change_role(&client).await?,
            "  Add member to workspace" => action_add_member(&client).await?,
            "  Remove member from workspace" => action_remove_member(&client).await?,
            "  AI settings & enforcement" => action_ai_settings(&client).await?,
            "Exit" => break,
            _ => {} // section headers — no-op
        }
        println!();
    }

    Ok(())
}
