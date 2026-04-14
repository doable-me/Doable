# TC-21: Users, Roles, Plans, Permissions & Admin — Deep Testing

> **Scope:** Creating and managing users of every kind, verifying role-based access control (RBAC), plan limits, credit system, billing, admin panel, and workspace membership.
> **Roles (workspace-level):** viewer < member < admin < owner
> **Plans:** free ($0) < pro ($25/mo) < business ($50/mo) < enterprise
> **Platform admin:** system-wide superuser, set via `is_platform_admin` flag

---

## Primary Account

> **uniquegodwin@gmail.com** — Your main OAuth account (U1, platform admin / owner). Has a working Copilot subscription that can be assigned to other users for AI testing.
>
> **Workflow:** You log in via Google OAuth and hand the browser session over. From that point, all testing (RBAC, plan limits, credits, admin panel, feature flags, etc.) is done autonomously — no further user involvement needed.
>
> For DB-created users (U2–U9), login is done directly at `https://dev.doable.me/login` with email + `TestPass123!` — no OAuth needed.

---

## Test User Creation Guide (Direct DB)

> **All test users are created via SQL on the dev server.** No Stripe or OAuth needed — plans and credits are set directly in the database.
>
> **SSH:** `ssh -i "C:\Users\gj\Documents\itdept" root@dodev.fid.pw`
> **DB:** `sudo -u postgres psql -d doable`

### Required Test Users

| # | User | Email | Workspace Role | Plan | Platform Admin | Purpose |
|---|------|-------|----------------|------|----------------|---------|
| U1 | Platform Admin (you) | uniquegodwin@gmail.com | owner | pro | YES | Primary account — OAuth, Stripe (manual) |
| U2 | Workspace Owner (Free) | owner-free@doable.me | owner | free | no | Free plan limits testing |
| U3 | Workspace Owner (Pro) | owner-pro@doable.me | owner | pro | no | Pro plan features testing |
| U4 | Workspace Owner (Business) | owner-biz@doable.me | owner | business | no | Business plan limits testing |
| U5 | Workspace Admin | ws-admin@doable.me | admin | — (in U3's workspace) | no | Admin operations, can't delete WS |
| U6 | Workspace Member | ws-member@doable.me | member | — (in U3's workspace) | no | Standard contributor |
| U7 | Workspace Viewer | ws-viewer@doable.me | viewer | — (in U3's workspace) | no | Read-only access |
| U8 | Outsider | outsider@doable.me | — (not in U3's WS) | free | no | Access denied testing |
| U9 | Second Platform Admin | admin2@doable.me | owner | pro | YES | Admin mutual control testing |

### Master Setup Script

Run this on the dev server to create all test users, workspaces, memberships, and credit balances in one shot.

> **Step 1: Generate password hash.** Run once on the server (Node.js with argon2):
> ```bash
> cd /root/doable && node -e "
>   const argon2 = require('argon2');
>   argon2.hash('TestPass123!', { type: 2, memoryCost: 65536, timeCost: 3, parallelism: 4 })
>     .then(h => console.log(h));
> "
> ```
> Copy the output hash (starts with `$argon2id$...`). Use it as `PASSWORD_HASH` below.

> **Step 2: Run SQL.** Replace `__HASH__` with the actual argon2 hash from Step 1:

```sql
-- ===================================================================
-- DOABLE TEST USER SETUP SCRIPT
-- Run: sudo -u postgres psql -d doable < test-users-setup.sql
-- ===================================================================

-- Shared password: TestPass123!
-- Replace __HASH__ with the argon2id hash from Step 1
\set pw_hash '__HASH__'

BEGIN;

-- -----------------------------------------------------------------
-- 1. CREATE USERS (U2–U9)
--    U1 (uniquegodwin@gmail.com) already exists via OAuth
-- -----------------------------------------------------------------

INSERT INTO users (email, password_hash, display_name) VALUES
  ('owner-free@doable.me',  :'pw_hash', 'Owner Free'),
  ('owner-pro@doable.me',   :'pw_hash', 'Owner Pro'),
  ('owner-biz@doable.me',   :'pw_hash', 'Owner Business'),
  ('ws-admin@doable.me',    :'pw_hash', 'WS Admin'),
  ('ws-member@doable.me',   :'pw_hash', 'WS Member'),
  ('ws-viewer@doable.me',   :'pw_hash', 'WS Viewer'),
  ('outsider@doable.me',    :'pw_hash', 'Outsider User'),
  ('admin2@doable.me',      :'pw_hash', 'Admin Two')
ON CONFLICT (email) DO NOTHING;

-- -----------------------------------------------------------------
-- 2. SET PLATFORM ADMIN FLAGS
--    U1 should already be platform admin; ensure it
--    U9 (admin2@doable.me) gets platform admin
-- -----------------------------------------------------------------

UPDATE users SET is_platform_admin = true
  WHERE email IN ('uniquegodwin@gmail.com', 'admin2@doable.me');

-- -----------------------------------------------------------------
-- 3. CREATE WORKSPACES (one per owner user)
-- -----------------------------------------------------------------

-- U2's workspace (free)
INSERT INTO workspaces (name, slug, owner_id, plan)
  SELECT 'Free Workspace', 'test-free-ws',
    (SELECT id FROM users WHERE email = 'owner-free@doable.me'), 'free'
  WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = 'test-free-ws');

-- U3's workspace (pro) — this is the main test workspace
INSERT INTO workspaces (name, slug, owner_id, plan)
  SELECT 'Pro Workspace', 'test-pro-ws',
    (SELECT id FROM users WHERE email = 'owner-pro@doable.me'), 'pro'
  WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = 'test-pro-ws');

-- U4's workspace (business)
INSERT INTO workspaces (name, slug, owner_id, plan)
  SELECT 'Business Workspace', 'test-biz-ws',
    (SELECT id FROM users WHERE email = 'owner-biz@doable.me'), 'business'
  WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = 'test-biz-ws');

-- U8's workspace (free — outsider's own)
INSERT INTO workspaces (name, slug, owner_id, plan)
  SELECT 'Outsider WS', 'test-outsider-ws',
    (SELECT id FROM users WHERE email = 'outsider@doable.me'), 'free'
  WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = 'test-outsider-ws');

-- U9's workspace (pro — second admin)
INSERT INTO workspaces (name, slug, owner_id, plan)
  SELECT 'Admin2 Workspace', 'test-admin2-ws',
    (SELECT id FROM users WHERE email = 'admin2@doable.me'), 'pro'
  WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = 'test-admin2-ws');

-- -----------------------------------------------------------------
-- 4. ADD OWNERS AS WORKSPACE MEMBERS
-- -----------------------------------------------------------------

INSERT INTO workspace_members (workspace_id, user_id, role)
  SELECT w.id, u.id, 'owner'
  FROM workspaces w JOIN users u ON w.owner_id = u.id
  WHERE w.slug IN ('test-free-ws','test-pro-ws','test-biz-ws','test-outsider-ws','test-admin2-ws')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- -----------------------------------------------------------------
-- 5. ADD MEMBERS TO U3's PRO WORKSPACE (U5=admin, U6=member, U7=viewer)
-- -----------------------------------------------------------------

-- U5 → admin in Pro Workspace
INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
  SELECT
    (SELECT id FROM workspaces WHERE slug = 'test-pro-ws'),
    (SELECT id FROM users WHERE email = 'ws-admin@doable.me'),
    'admin',
    (SELECT id FROM users WHERE email = 'owner-pro@doable.me')
ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'admin';

-- U6 → member in Pro Workspace
INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
  SELECT
    (SELECT id FROM workspaces WHERE slug = 'test-pro-ws'),
    (SELECT id FROM users WHERE email = 'ws-member@doable.me'),
    'member',
    (SELECT id FROM users WHERE email = 'owner-pro@doable.me')
ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'member';

-- U7 → viewer in Pro Workspace
INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
  SELECT
    (SELECT id FROM workspaces WHERE slug = 'test-pro-ws'),
    (SELECT id FROM users WHERE email = 'ws-viewer@doable.me'),
    'viewer',
    (SELECT id FROM users WHERE email = 'owner-pro@doable.me')
ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'viewer';

-- -----------------------------------------------------------------
-- 6. INITIALIZE CREDIT BALANCES
-- -----------------------------------------------------------------

-- Free plan users: 5 daily, 0 monthly
INSERT INTO credit_balances (user_id, workspace_id, daily_credits, monthly_credits, rollover_credits, plan_type, daily_reset_at, monthly_reset_at)
  SELECT u.id, w.id, 5, 0, 0, 'free',
    now() + interval '1 day',
    date_trunc('month', now()) + interval '1 month'
  FROM users u JOIN workspaces w ON w.owner_id = u.id
  WHERE u.email IN ('owner-free@doable.me', 'outsider@doable.me')
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- Pro plan users: 50 daily, 500 monthly
INSERT INTO credit_balances (user_id, workspace_id, daily_credits, monthly_credits, rollover_credits, plan_type, daily_reset_at, monthly_reset_at)
  SELECT u.id, w.id, 50, 500, 0, 'pro',
    now() + interval '1 day',
    date_trunc('month', now()) + interval '1 month'
  FROM users u JOIN workspaces w ON w.owner_id = u.id
  WHERE u.email IN ('owner-pro@doable.me', 'admin2@doable.me')
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- Business plan user: 200 daily, 3000 monthly
INSERT INTO credit_balances (user_id, workspace_id, daily_credits, monthly_credits, rollover_credits, plan_type, daily_reset_at, monthly_reset_at)
  SELECT u.id, w.id, 200, 3000, 0, 'business',
    now() + interval '1 day',
    date_trunc('month', now()) + interval '1 month'
  FROM users u JOIN workspaces w ON w.owner_id = u.id
  WHERE u.email = 'owner-biz@doable.me'
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- Invited members get credits in the Pro workspace they joined
INSERT INTO credit_balances (user_id, workspace_id, daily_credits, monthly_credits, rollover_credits, plan_type, daily_reset_at, monthly_reset_at)
  SELECT u.id, w.id, 50, 500, 0, 'pro',
    now() + interval '1 day',
    date_trunc('month', now()) + interval '1 month'
  FROM users u
  CROSS JOIN (SELECT id FROM workspaces WHERE slug = 'test-pro-ws') w
  WHERE u.email IN ('ws-admin@doable.me', 'ws-member@doable.me', 'ws-viewer@doable.me')
ON CONFLICT (user_id, workspace_id) DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------
-- 7. VERIFY SETUP
-- -----------------------------------------------------------------

SELECT u.email, u.display_name, u.is_platform_admin,
       wm.role AS ws_role, w.name AS workspace, w.plan
FROM users u
LEFT JOIN workspace_members wm ON wm.user_id = u.id
LEFT JOIN workspaces w ON w.id = wm.workspace_id
WHERE u.email LIKE '%doable.me' OR u.email = 'uniquegodwin@gmail.com'
ORDER BY u.email, w.name;
```

### Login Credentials

All DB-created users share the same password: **`TestPass123!`**

To log in as any test user: go to `https://dev.doable.me/login` → enter email + `TestPass123!`.

### Cleanup Script (when done)

```sql
-- Remove test users and cascade-delete their workspaces/memberships
DELETE FROM users WHERE email IN (
  'owner-free@doable.me', 'owner-pro@doable.me', 'owner-biz@doable.me',
  'ws-admin@doable.me', 'ws-member@doable.me', 'ws-viewer@doable.me',
  'outsider@doable.me', 'admin2@doable.me'
);
-- Note: CASCADE on FK will clean up workspace_members, credit_balances, etc.
-- Workspaces owned by deleted users will also be deleted if ON DELETE CASCADE is set.
```

### Verification Checklist

After running the setup script, verify via DB or Admin panel:
- [ ] 8 new users exist (U2–U9) + U1 already exists
- [ ] 5 workspaces created (free, pro, business, outsider, admin2)
- [ ] U5/U6/U7 are members of Pro Workspace with correct roles
- [ ] U1 and U9 have `is_platform_admin = true`
- [ ] Credit balances initialized for all users
- [ ] All users can log in with `TestPass123!` at dev.doable.me

---

## 21.1 User Registration — Email/Password (P0)

### TC-21.1.1 — Register with valid email and password
- **Steps:** Go to signup page → email: `newuser@test.com` → password: `SecurePass1!` → submit.
- **Expected:** Account created. Auto-redirected to dashboard. Personal workspace created (plan: free). Welcome toast.

### TC-21.1.2 — Password validation: too short
- **Steps:** Try password: `Ab1!` (< 8 chars).
- **Expected:** Error: password must be ≥ 8 characters.

### TC-21.1.3 — Password validation: no uppercase
- **Steps:** Try password: `password123!`.
- **Expected:** Error: must contain uppercase letter.

### TC-21.1.4 — Password validation: no lowercase
- **Steps:** Try password: `PASSWORD123!`.
- **Expected:** Error: must contain lowercase letter.

### TC-21.1.5 — Password validation: no digit
- **Steps:** Try password: `SecurePass!!`.
- **Expected:** Error: must contain a digit.

### TC-21.1.6 — Duplicate email registration
- **Steps:** Register with an email that already exists.
- **Expected:** Error: email already in use. No duplicate user created.

### TC-21.1.7 — Email normalization (case-insensitive)
- **Steps:** Register with `TestUser@DOABLE.me` → try logging in with `testuser@doable.me`.
- **Expected:** Login succeeds. Email stored lowercase.

### TC-21.1.8 — Auto-created workspace on registration
- **Steps:** Register new user → check dashboard.
- **Expected:** One workspace exists (personal). User is owner. Plan is "free". Credit balances initialized.

### TC-21.1.9 — Rate limiting on registration
- **Steps:** Attempt 6+ registrations from the same IP within 1 hour.
- **Expected:** After 5 attempts, rate limit hit: 429 error. "Too many requests" message.

---

## 21.2 User Registration — OAuth (P0)

> ⚠️ **MANUAL — Owner login only.** The owner logs in via Google/GitHub OAuth and hands the browser session over. All post-login testing (navigation, RBAC, admin panel, etc.) is done autonomously. Only the initial OAuth authentication step requires the owner.

### TC-21.2.1 — Sign in with Google OAuth (new user)
- **Steps:** Click "Sign in with Google" → authorize with a new Google account.
- **Expected:** Account created. `google_id` set. Display name and avatar from Google. Workspace auto-created.

### TC-21.2.2 — Sign in with Google OAuth (existing user)
- **Steps:** Sign in with Google using an email that already has an account.
- **Expected:** Account linked (upsert). `google_id` added to existing user. No duplicate user.

### TC-21.2.3 — Sign in with GitHub OAuth (new user)
- **Steps:** Click "Sign in with GitHub" → authorize.
- **Expected:** Account created. `github_id` set. Display name and avatar from GitHub. Workspace auto-created.

### TC-21.2.4 — Sign in with GitHub OAuth (existing user)
- **Steps:** Sign in with GitHub using an email that already has an account.
- **Expected:** Account linked. `github_id` added. Seamless login.

### TC-21.2.5 — OAuth user has no password
- **Steps:** Register via OAuth → try to set up password via user settings.
- **Expected:** OAuth-only users may not have password_hash. If password change is shown, it should allow setting initial password.

---

## 21.3 Workspace Roles — Owner (P0)

### TC-21.3.1 — Owner can access all workspace settings
- **Steps:** Log in as workspace owner (U3) → navigate to workspace settings.
- **Expected:** All tabs accessible: General, Members, Knowledge, Environments, Danger Zone.

### TC-21.3.2 — Owner can invite members
- **Steps:** As owner → Members tab → invite user by email with any role.
- **Expected:** Invite sent. Pending invite listed.

### TC-21.3.3 — Owner can change member roles
- **Steps:** As owner → Members → change U6 from "member" to "admin".
- **Expected:** Role updated immediately. U6 now has admin permissions.

### TC-21.3.4 — Owner can remove any member (including admins)
- **Steps:** As owner → Members → remove U5 (who is admin).
- **Expected:** U5 removed from workspace. U5 loses access to all workspace projects.

### TC-21.3.5 — Owner can delete workspace
- **Steps:** As owner → Danger Zone → delete workspace → type confirmation.
- **Expected:** Workspace deleted. All projects deleted. Owner redirected. Members lose access.

### TC-21.3.6 — Owner can transfer ownership
- **Steps:** As owner → Danger Zone → transfer workspace to another user's email.
- **Expected:** Transfer request sent (or immediate transfer). New owner gains full control. Original owner becomes admin/member.

### TC-21.3.7 — Owner cannot change own role
- **Steps:** As owner → try to change own role to member/admin.
- **Expected:** Not allowed. Owner role is permanent (must transfer first).

### TC-21.3.8 — Owner cannot remove themselves
- **Steps:** As owner → try to remove self from workspace.
- **Expected:** Not allowed. Must transfer ownership first.

---

## 21.4 Workspace Roles — Admin (P1)

### TC-21.4.1 — Admin can edit workspace settings
- **Steps:** Log in as U5 (admin) → workspace settings → change name.
- **Expected:** Settings accessible and editable. Save succeeds.

### TC-21.4.2 — Admin can invite members (not owners)
- **Steps:** As admin → invite new user as "member" or "viewer".
- **Expected:** Invite sent successfully.

### TC-21.4.3 — Admin can remove regular members
- **Steps:** As admin → remove U6 (member).
- **Expected:** Member removed successfully.

### TC-21.4.4 — Admin CANNOT remove other admins
- **Steps:** As admin (U5) → try removing another admin.
- **Expected:** Action blocked. Error: insufficient permissions.

### TC-21.4.5 — Admin CANNOT change member roles
- **Steps:** As admin → try changing U6's role.
- **Expected:** Role change only allowed for owner. Admin cannot change roles.

### TC-21.4.6 — Admin CANNOT delete workspace
- **Steps:** As admin → navigate to Danger Zone.
- **Expected:** Delete workspace option either hidden or disabled for non-owners.

### TC-21.4.7 — Admin CANNOT transfer ownership
- **Steps:** As admin → try transfer workspace.
- **Expected:** Not allowed. Only owner can transfer.

### TC-21.4.8 — Admin can create/edit/delete projects
- **Steps:** As admin → create new project → edit it → delete it.
- **Expected:** Full project CRUD available.

---

## 21.5 Workspace Roles — Member (P1)

### TC-21.5.1 — Member can view workspace projects
- **Steps:** Log in as U6 (member) → navigate to dashboard.
- **Expected:** All workspace projects visible.

### TC-21.5.2 — Member can create projects
- **Steps:** As member → create new project.
- **Expected:** Project created within the workspace.

### TC-21.5.3 — Member can edit projects they have access to
- **Steps:** As member → open a project → edit code → use AI chat.
- **Expected:** Full editor access. AI chat works.

### TC-21.5.4 — Member CANNOT access workspace settings
- **Steps:** As member → try navigating to `/workspace-settings`.
- **Expected:** Settings page hidden, redirected, or shows read-only view.

### TC-21.5.5 — Member CANNOT invite other members
- **Steps:** As member → try inviting users.
- **Expected:** Invite option not shown or returns 403.

### TC-21.5.6 — Member CANNOT remove other members
- **Steps:** As member → try removing a workspace member.
- **Expected:** Not allowed. 403 error.

### TC-21.5.7 — Member CANNOT see admin panel
- **Steps:** As member → try navigating to `/admin`.
- **Expected:** Access denied. Not a platform admin.

---

## 21.6 Workspace Roles — Viewer (P1)

### TC-21.6.1 — Viewer can view workspace projects (read-only)
- **Steps:** Log in as U7 (viewer) → navigate to dashboard.
- **Expected:** Projects visible. Can open them.

### TC-21.6.2 — Viewer CANNOT create projects
- **Steps:** As viewer → try creating a new project.
- **Expected:** Create button hidden or returns 403.

### TC-21.6.3 — Viewer CANNOT edit project code
- **Steps:** As viewer → open a project → try editing in Monaco editor.
- **Expected:** Editor read-only. Cannot type or save changes.

### TC-21.6.4 — Viewer CANNOT use AI chat
- **Steps:** As viewer → open a project → try sending an AI chat message.
- **Expected:** Chat disabled or blocked. Viewers are read-only.

### TC-21.6.5 — Viewer CANNOT change workspace settings
- **Steps:** As viewer → try accessing workspace settings.
- **Expected:** Not allowed. Settings page hidden or 403.

### TC-21.6.6 — Viewer CAN view published sites
- **Steps:** As viewer → click Visit on project's published URL.
- **Expected:** Published site viewable. Preview accessible.

---

## 21.7 Non-Member / Outsider Access (P0)

### TC-21.7.1 — Outsider CANNOT access private workspace projects
- **Steps:** Log in as U8 (outsider) → try navigating to a project URL in U3's workspace.
- **Expected:** 403 or redirect. "Access denied" or "Project not found."

### TC-21.7.2 — Outsider CANNOT access workspace settings
- **Steps:** As U8 → try `/workspace-settings` for U3's workspace.
- **Expected:** 403 or redirect.

### TC-21.7.3 — Outsider CAN access public project
- **Steps:** U3 creates a public project → U8 navigates to its published URL.
- **Expected:** Published site accessible. Cannot edit.

### TC-21.7.4 — Outsider CAN view shared project via link
- **Steps:** U3 shares a project URL with link sharing enabled → U8 opens it.
- **Expected:** Project viewable in read-only mode (if share settings allow).

### TC-21.7.5 — Unauthenticated user access
- **Steps:** Open incognito browser → navigate to a project URL.
- **Expected:** Redirected to login page. Cannot view private content.

---

## 21.8 Plan Limits — Free Plan (P0)

### TC-21.8.1 — Free plan: max 3 projects
- **Steps:** Log in as U2 (free owner) → create 3 projects → try creating 4th.
- **Expected:** First 3 succeed. 4th project blocked: "Project limit reached. Upgrade to Pro."

### TC-21.8.2 — Free plan: max 1 member
- **Steps:** As U2 → invite a second member (already has 1: themselves).
- **Expected:** Invite blocked: "Member limit reached." (1 member = owner only)

### TC-21.8.3 — Free plan: 5 daily AI credits
- **Steps:** As U2 → use AI chat 5 times → try 6th.
- **Expected:** First 5 work. 6th returns 429: "Daily credit limit reached." Shows remaining: 0.

### TC-21.8.4 — Free plan: 0 monthly credits
- **Steps:** After daily credits exhausted, check if monthly credits available.
- **Expected:** No monthly credits on free plan. Must wait for daily reset (00:00 UTC).

### TC-21.8.5 — Free plan: 5MB file size limit
- **Steps:** Try uploading a file > 5MB.
- **Expected:** Upload rejected: "File size exceeds limit." Free plan: max 5MB.

### TC-21.8.6 — Free plan: custom domains NOT available
- **Steps:** As U2 → project settings → Custom Domain tab.
- **Expected:** Shows "Pro+ Feature" with Crown icon and "Upgrade to Pro" button. Cannot add domains.

### TC-21.8.7 — Free plan: daily credit reset
- **Steps:** Exhaust all 5 daily credits → wait until 00:00 UTC → check balance.
- **Expected:** Daily credits reset to 5. Can use AI again.

---

## 21.9 Plan Limits — Pro Plan (P1)

### TC-21.9.1 — Pro plan: 25 projects
- **Steps:** Log in as U3 (pro owner) → verify can create up to 25 projects.
- **Expected:** Up to 25 projects allowed. 26th blocked.

### TC-21.9.2 — Pro plan: 5 members
- **Steps:** As U3 → invite 4 additional members (total 5 with owner).
- **Expected:** Up to 5 members work. 6th invite blocked.

### TC-21.9.3 — Pro plan: 50 daily + 500 monthly credits
- **Steps:** Check credit balance display.
- **Expected:** Shows: Daily: 50, Monthly: 500. Both pools available.

### TC-21.9.4 — Pro plan: credits consumed from daily first
- **Steps:** Use AI chat → check which credit pool decreased.
- **Expected:** Daily credits decrease first. Monthly used after daily exhausted.

### TC-21.9.5 — Pro plan: custom domains available
- **Steps:** As U3 → project settings → Custom Domain tab.
- **Expected:** Full domain management UI shown. Can add custom domains.

### TC-21.9.6 — Pro plan: 25MB file size limit
- **Steps:** Upload a 20MB file.
- **Expected:** Upload succeeds (under 25MB limit).

### TC-21.9.7 — Pro plan: connectors available
- **Steps:** As U3 → project settings → MCP tab → add connector.
- **Expected:** MCP connector creation works (connectors is a pro+ feature).

---

## 21.10 Plan Limits — Business Plan (P1)

### TC-21.10.1 — Business plan: 100 projects
- **Steps:** As U4 (business) → verify project limit is 100.
- **Expected:** Can create many more projects than pro. Limit at 100.

### TC-21.10.2 — Business plan: 25 members
- **Steps:** As U4 → verify member limit is 25.
- **Expected:** Can invite up to 24 additional members.

### TC-21.10.3 — Business plan: 200 daily + 3000 monthly credits
- **Steps:** Check credit balance.
- **Expected:** Generous credit allocation. Daily: 200, Monthly: 3000.

### TC-21.10.4 — Business plan: security center available
- **Steps:** As U4 → check if security center features are accessible.
- **Expected:** Security center enabled (business+ feature). Not available on free/pro.

### TC-21.10.5 — Business plan: 100MB file size limit
- **Steps:** Upload a 90MB file.
- **Expected:** Upload succeeds (under 100MB limit).

---

## 21.11 Plan Upgrade & Billing (P1)

> ⚠️ **MANUAL — Owner only.** Stripe billing requires a real credit card. The owner will test payment flows manually. Plan changes for test users are done directly in the DB (see Master Setup Script).

### TC-21.11.1 — View billing page
- **Steps:** Navigate to `/billing`.
- **Expected:** Billing page loads. Shows current plan, usage, credit balance, upgrade options.

### TC-21.11.2 — Pricing cards display
- **Steps:** View plan comparison cards.
- **Expected:** Free ($0), Pro ($25/mo or $240/yr), Business ($50/mo or $480/yr) shown. Feature comparison matrix.

### TC-21.11.3 — Upgrade from Free to Pro
- **Steps:** Click "Upgrade to Pro" → Stripe checkout opens → complete payment (test mode).
- **Expected:** Stripe checkout loads. After payment: plan updated to "pro". Limits increased immediately. Credits allocated.

### TC-21.11.4 — Upgrade from Pro to Business
- **Steps:** Billing page → "Upgrade to Business" → Stripe portal.
- **Expected:** Stripe customer portal opens. Plan change processed. New limits apply.

### TC-21.11.5 — Downgrade plan
- **Steps:** Billing page → manage subscription → downgrade from Pro to Free.
- **Expected:** Downgrade scheduled for end of billing period (or immediate). Limits reduce. Projects beyond new limit: ??? (test what happens).

### TC-21.11.6 — Top-up credits (rollover)
- **Steps:** Billing page → "Buy Credits" → purchase rollover credits via Stripe.
- **Expected:** Rollover credits added. These don't expire with daily/monthly reset.

### TC-21.11.7 — Credit display UI ✅ (testable)
- **Steps:** Check credit balance display in sidebar/header.
- **Expected:** Shows: Daily remaining / Daily total, Monthly remaining / Monthly total, Rollover (if any).

### TC-21.11.8 — Stripe webhook handling
- **Steps:** After payment → check that Stripe webhook updated subscription record.
- **Expected:** `subscriptions` table updated: plan, status, current_period_end correct.

---

## 21.12 Credit System (P0)

### TC-21.12.1 — Credit consumed on AI chat message
- **Steps:** Check credit balance → send 1 AI chat message → check balance again.
- **Expected:** Credit balance decreased by 1 (or per credit-per-message configuration).

### TC-21.12.2 — Insufficient credits → 429 error
- **Steps:** Exhaust all credits → try sending AI chat message.
- **Expected:** 429 response. Message: "Insufficient credits" with current balance shown. Chat disabled or shows upgrade prompt.

### TC-21.12.3 — Daily reset at 00:00 UTC
- **Steps:** Exhaust daily credits → wait past midnight UTC → check.
- **Expected:** Daily credits reset to plan limit. Monthly credits NOT reset.

### TC-21.12.4 — Monthly reset on 1st of month
- **Steps:** Exhaust monthly credits → wait until 1st of next month → check.
- **Expected:** Monthly credits reset to plan limit.

### TC-21.12.5 — Rollover credits never reset
- **Steps:** Admin grants rollover credits → verify they persist through daily/monthly resets.
- **Expected:** Rollover credits remain unchanged after daily/monthly reset.

### TC-21.12.6 — Credit consumption order
- **Steps:** Have daily + monthly + rollover credits → send messages → track which pool decreases.
- **Expected:** Daily → Monthly → Rollover (most perishable consumed first).

### TC-21.12.7 — Usage history
- **Steps:** Use several credits → check usage history/log.
- **Expected:** Each credit usage logged with timestamp, amount, operation type.

### TC-21.12.8 — Credit balance shown in UI
- **Steps:** Check sidebar or header for credit display.
- **Expected:** Current balance visible. Updates after each AI interaction.

---

## 21.13 Platform Admin — Admin Panel (P0)

### TC-21.13.1 — Access admin panel as platform admin
- **Steps:** Log in as U1 (platform admin) → navigate to `/admin`.
- **Expected:** Admin panel loads with tabs: Features, Users, Thumbnails, Copilot Sessions.

### TC-21.13.2 — Access denied for non-admin
- **Steps:** Log in as U6 (member) → navigate to `/admin`.
- **Expected:** Access denied. Redirected to dashboard. 403 error.

### TC-21.13.3 — Users tab — view all platform users
- **Steps:** As U1 → Admin → Users.
- **Expected:** All registered users listed with: name, email, role, plan, admin status, created date.

### TC-21.13.4 — Grant platform admin to another user
- **Steps:** As U1 → find U8 (outsider) → toggle "Platform Admin" ON.
- **Expected:** U8 becomes platform admin. `is_platform_admin = true`. U8 can now access `/admin`.

### TC-21.13.5 — Revoke platform admin from another user
- **Steps:** As U1 → find U9 (admin2) → toggle "Platform Admin" OFF.
- **Expected:** U9 loses admin access. Cannot access `/admin` anymore.

### TC-21.13.6 — Cannot revoke own admin status
- **Steps:** As U1 → try toggling own platform admin OFF.
- **Expected:** Blocked. Cannot remove own admin access. Error message shown.

### TC-21.13.7 — Change user's plan via admin
- **Steps:** As U1 → find U8 → change plan from "free" to "pro".
- **Expected:** User's workspace plan updated. New limits apply immediately.

### TC-21.13.8 — Allocate credits to user via admin
- **Steps:** As U1 → find a user → allocate 100 rollover credits.
- **Expected:** User's credit balance increases by 100. Rollover pool updated.

### TC-21.13.9 — View user credit details
- **Steps:** As U1 → click on a user → view credit allocation breakdown.
- **Expected:** Shows: daily/monthly/rollover balances, usage history, plan limits.

---

## 21.14 Platform Admin — Feature Flags (P1)

### TC-21.14.1 — View all feature flags
- **Steps:** As U1 → Admin → Features tab.
- **Expected:** All feature flags listed with: key, label, description, enabled status, min_plan, min_role.

### TC-21.14.2 — Disable a feature globally
- **Steps:** Toggle `custom_domains` feature OFF.
- **Expected:** No user (even pro/business) can add custom domains. Feature disabled platform-wide.

### TC-21.14.3 — Enable a feature globally
- **Steps:** Toggle `custom_domains` feature back ON.
- **Expected:** Custom domains available again for qualifying plans.

### TC-21.14.4 — Feature flag: min_plan check
- **Steps:** Feature `connectors` has min_plan = "pro". Free user tries to add MCP connector.
- **Expected:** Blocked: feature requires Pro plan. Feature flag check returns `{ allowed: false, reason: "Requires Pro plan" }`.

### TC-21.14.5 — Feature flag: min_role check
- **Steps:** Feature with min_role = "admin". Member tries to access.
- **Expected:** Blocked by role check.

### TC-21.14.6 — Per-user feature override
- **Steps:** As admin → create override: grant `custom_domains` to a specific free user.
- **Expected:** That free user can now add custom domains. Override bypasses plan check.

### TC-21.14.7 — Platform admin auto-bypass feature flags
- **Steps:** As platform admin → access any feature regardless of plan/role.
- **Expected:** Platform admins auto-allowed. Feature flag check always returns `allowed: true` for admins.

### TC-21.14.8 — Feature check endpoint
- **Steps:** As any user → `GET /admin/features/check/custom_domains?workspaceId=...`.
- **Expected:** Returns `{ allowed: true/false, reason: "..." }`. Non-admin users can check but not modify.

---

## 21.15 Workspace Membership — Invitation Flow (P0)

### TC-21.15.1 — Invite by email (existing user)
- **Steps:** As workspace admin → invite `outsider@doable.me` (already registered) as "member".
- **Expected:** Invite created. Token generated (32 hex bytes). Expires in 7 days.

### TC-21.15.2 — Invite by email (new email)
- **Steps:** Invite `brand-new@doable.me` (not registered).
- **Expected:** Invite created. When this email registers and accepts, they join workspace.

### TC-21.15.3 — Accept invite
- **Steps:** As the invited user → use invite link/token → accept.
- **Expected:** User added to `workspace_members`. Role matches invitation. `accepted_at` set.

### TC-21.15.4 — Invite expiry (7 days)
- **Steps:** Create invite → wait 7+ days (or manually set expires_at in DB) → try accepting.
- **Expected:** Invite expired. Cannot accept. Error: "This invitation has expired."

### TC-21.15.5 — Shareable invite link
- **Steps:** As admin → generate invite link with role "member".
- **Expected:** Link generated. Any authenticated user can use it to join the workspace as "member."

### TC-21.15.6 — Duplicate invite (same email)
- **Steps:** Invite `ws-member@doable.me` who is already a member.
- **Expected:** Error: user is already a member of this workspace.

### TC-21.15.7 — Invite with viewer role
- **Steps:** Invite a user as "viewer" → user accepts → verify permissions.
- **Expected:** User joins with viewer role. Read-only access confirmed.

### TC-21.15.8 — Maximum members per plan
- **Steps:** On free plan (1 member limit) → try inviting anyone.
- **Expected:** Blocked: "Member limit reached. Upgrade your plan."

---

## 21.16 Workspace Membership — Role Changes & Removal (P1)

### TC-21.16.1 — Owner changes member to admin
- **Steps:** As owner → Members → change U6 from "member" to "admin".
- **Expected:** Role updated. U6 now has admin permissions (can edit settings, invite members).

### TC-21.16.2 — Owner changes admin to viewer
- **Steps:** As owner → Members → change U5 from "admin" to "viewer".
- **Expected:** Role downgraded. U5 loses admin capabilities. Now read-only.

### TC-21.16.3 — Admin cannot change roles
- **Steps:** As admin → try to change another user's role.
- **Expected:** Not allowed. Only owner can change roles.

### TC-21.16.4 — Remove member → loses project access
- **Steps:** As owner → remove U6 from workspace → as U6 try accessing a project.
- **Expected:** U6 no longer sees workspace projects. 403 on API requests to workspace resources.

### TC-21.16.5 — Removed member's projects remain
- **Steps:** U6 created a project before removal. After removal, check project.
- **Expected:** Project still exists in workspace. Other members can still access it.

### TC-21.16.6 — Re-invite removed member
- **Steps:** After removing U6 → invite U6 again.
- **Expected:** Re-invitation works. U6 can rejoin with new role.

---

## 21.17 Cross-Role Permission Matrix (P0)

> Each cell: ✅ allowed, ❌ blocked

| Action | Owner | Admin | Member | Viewer | Outsider |
|--------|-------|-------|--------|--------|----------|
| View dashboard | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create project | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit project code | ✅ | ✅ | ✅ | ❌ | ❌ |
| Use AI chat | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete project | ✅ | ✅ | ✅* | ❌ | ❌ |
| View workspace settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit workspace settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Invite members | ✅ | ✅ | ❌ | ❌ | ❌ |
| Remove member | ✅ | ✅** | ❌ | ❌ | ❌ |
| Change member roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete workspace | ✅ | ❌ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ | ❌ |
| Access admin panel | 🔑 | 🔑 | ❌ | ❌ | ❌ |
| View published site | ✅ | ✅ | ✅ | ✅ | ✅ (public) |

> *Members may only delete their own projects. **Admins cannot remove other admins. 🔑 = requires `is_platform_admin`.

### TC-21.17.1 — Walk through permission matrix for Owner
- **Steps:** As owner (U3), attempt every action in the matrix.
- **Expected:** All ✅ actions succeed. All ❌ actions not applicable (owner has highest role).

### TC-21.17.2 — Walk through permission matrix for Admin
- **Steps:** As admin (U5), attempt every action.
- **Expected:** ✅ actions succeed. ❌ actions return 403 or UI elements hidden.

### TC-21.17.3 — Walk through permission matrix for Member
- **Steps:** As member (U6), attempt every action.
- **Expected:** Can view, create, edit projects. Cannot manage workspace or members.

### TC-21.17.4 — Walk through permission matrix for Viewer
- **Steps:** As viewer (U7), attempt every action.
- **Expected:** Read-only everywhere. Cannot create, edit, chat, manage anything.

### TC-21.17.5 — Walk through permission matrix for Outsider
- **Steps:** As outsider (U8), attempt to access another workspace's resources.
- **Expected:** Everything blocked except viewing public published sites.

---

## 21.18 Feature Gating by Plan (P1)

| Feature | Free | Pro | Business | Enterprise |
|---------|------|-----|----------|------------|
| Projects | 3 | 25 | 100 | ∞ |
| Members | 1 | 5 | 25 | ∞ |
| Daily Credits | 5 | 50 | 200 | ∞ |
| Monthly Credits | 0 | 500 | 3,000 | ∞ |
| File Size | 5MB | 25MB | 100MB | 500MB |
| Custom Domains | ❌ | ✅ | ✅ | ✅ |
| Code Editor | ❌ | ✅ | ✅ | ✅ |
| Connectors/MCP | ❌ | ✅ | ✅ | ✅ |
| Security Center | ❌ | ❌ | ✅ | ✅ |
| Analytics | ❌ | ✅ | ✅ | ✅ |

### TC-21.18.1 — Free user cannot access pro features
- **Steps:** As free user → try custom domains, connectors, code editor.
- **Expected:** Each shows upgrade prompt. Feature blocked.

### TC-21.18.2 — Pro user can access pro features, not business features
- **Steps:** As pro user → access custom domains (works) → try security center.
- **Expected:** Custom domains: available. Security center: blocked (business+).

### TC-21.18.3 — Business user can access all except enterprise
- **Steps:** As business user → access all features up to business tier.
- **Expected:** All features through business tier available.

### TC-21.18.4 — Enterprise user: no limits
- **Steps:** As enterprise user → create many projects, invite many members.
- **Expected:** No limits hit. Everything unlimited.

### TC-21.18.5 — Plan downgrade: projects over limit
- **Steps:** Pro user with 20 projects → downgrade to free (limit: 3).
- **Expected:** Existing projects remain but user cannot create new ones until under limit. Or shows warning about excess.

---

## 21.19 User Profile Management (P1)

### TC-21.19.1 — Update display name
- **Steps:** User settings → change display name → save.
- **Expected:** Name updated across all UI: sidebar, chat messages, collaboration presence.

### TC-21.19.2 — Update avatar
- **Steps:** User settings → upload new avatar → save.
- **Expected:** Avatar updated everywhere. Old avatar replaced.

### TC-21.19.3 — Change password (email auth user)
- **Steps:** User settings → Security → current password → new password → confirm → save.
- **Expected:** Password changed. Old password no longer works. Session stays active.

### TC-21.19.4 — Delete account
- **Steps:** User settings → Danger Zone → delete account → type confirmation.
- **Expected:** Account deleted. All personal workspaces deleted. Removed from shared workspaces. Redirect to landing page. Cannot log in again.

### TC-21.19.5 — Delete account with owned workspaces
- **Steps:** User owns workspaces with other members → delete account.
- **Expected:** Either: (a) must transfer ownership first, or (b) workspace deleted with warning. Other members notified.

---

## 21.20 Edge Cases & Security (P0)

### TC-21.20.1 — JWT expiry and refresh
- **Steps:** Log in → wait for JWT to expire (or manually invalidate) → make API request.
- **Expected:** Token refreshed silently. Or user prompted to re-login. No unauthorized data access.

### TC-21.20.2 — Concurrent sessions
- **Steps:** Log in from two browsers simultaneously.
- **Expected:** Both sessions work independently. Actions in one don't log out the other.

### TC-21.20.3 — Role escalation attempt (API manipulation)
- **Steps:** Member tries to call `PATCH /workspaces/:id/members/:userId` directly via API to change own role to owner.
- **Expected:** 403 Forbidden. Role check middleware blocks. No privilege escalation.

### TC-21.20.4 — Plan spoofing (API manipulation)
- **Steps:** Free user tries to call project creation API beyond limit.
- **Expected:** Server-side plan limit enforced. 429 or 403. Cannot bypass client-side checks.

### TC-21.20.5 — XSS in display name
- **Steps:** Set display name to `<script>alert('xss')</script>`.
- **Expected:** HTML escaped on render. No script execution. Name shown as plain text.

### TC-21.20.6 — SQL injection in email field
- **Steps:** Try registering with email `test@doable.me'; DROP TABLE users;--`.
- **Expected:** Parameterized queries prevent SQL injection. Registration fails on email validation. No DB damage.

### TC-21.20.7 — Brute force password login
- **Steps:** Try 20+ incorrect passwords for a valid email.
- **Expected:** Rate limited after 5 attempts. Account locked or cooldown period.

### TC-21.20.8 — Invite token reuse
- **Steps:** Accept an invite → try using the same invite token again.
- **Expected:** Token invalidated after acceptance. Second use fails: "Invite already accepted."

### TC-21.20.9 — Cross-workspace data leakage
- **Steps:** As member of Workspace A → try API calls with Workspace B's project IDs.
- **Expected:** 403. Middleware checks workspace membership before allowing access.

### TC-21.20.10 — Password stored securely
- **Steps:** Check DB for user's password_hash.
- **Expected:** Hashed with Argon2id. NOT stored in plaintext. Salt included.
