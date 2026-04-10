# Route Collision Analysis: `:id` vs Literal Path Segments

## Bug A Summary

**Error**: `invalid input syntax for type uuid: "recently-viewed"`
**Root cause**: `projectFileRoutes` middleware at `/projects/:id/*` matches `/projects/recently-viewed` and passes the literal string `"recently-viewed"` as a UUID to PostgreSQL.
**Fix applied**: Added `UUID_RE` check at `services/api/src/routes/project-files.ts` lines 42, 56, 97.

## Fix Verification

The fix is **correct and sufficient** for `project-files.ts`. The `UUID_RE` regex:
```
/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```
is applied in both middleware handlers (line 56 auto-join, line 97 authorization). When the `:id` param fails the UUID check, the middleware calls `await next(); return;` which correctly skips the SQL queries and lets the request fall through.

## Route Mounting Order (services/api/src/index.ts)

```
app.route("/", projectFileRoutes);     // line 224 — /projects/:id/*
app.route("/", chatRoutes);            // line 228 — /projects/:id/chat
app.route("/", editorRoutes);          // line 230 — /projects/:id/files
app.route("/projects", projectRoutes); // line 231 — /projects/starred, /projects/recently-viewed, /projects/:id
app.route("/folders", folderRoutes);   // line 237 — /folders/:id
```

## Other Routes With Potential Collision Risk

### 1. `projects.ts` -- SAFE (mitigated by route ordering)

The `projectRoutes` file already handles this correctly by defining literal routes BEFORE `/:id`:
- Line 72: `GET /starred` (before `/:id`)
- Line 101: `GET /shared` (before `/:id`)
- Line 262: `GET /recently-viewed` (before `/:id`)
- Line 346: `GET /:id` (catch-all, comes after)

These are safe because Hono matches routes in definition order. The literal paths `/starred`, `/shared`, `/recently-viewed` are defined before `/:id`, so they win.

However, `projectRoutes` still has no UUID validation on `:id` routes. If a user navigates to `/projects/garbage`, the `requireProjectAccess` function will query `SELECT ... WHERE id = 'garbage'` which will fail with the same "invalid input syntax for type uuid" PostgreSQL error. This is a **minor issue** -- it returns a 500 instead of a clean 404, but it's not a crash-the-dashboard bug since these routes aren't hit by the dashboard UI.

### 2. `chat.ts` -- PARTIALLY AT RISK

Routes like `/projects/:id/chat` (line 840), `/projects/:id/ai-status` (line 2647), etc. These are mounted at `/` (line 228 in index.ts), so the full path is `/projects/:id/chat`.

The `:id/chat` suffix means this won't match `/projects/recently-viewed` (no `/chat` suffix). But the **middleware** at line 50-51:
```
chatRoutes.use("/projects/:id/chat", authMiddleware);
chatRoutes.use("/projects/:id/chat/*", authMiddleware);
```
And the auto-join middleware at line 55:
```
chatRoutes.use("/projects/:id/chat", async (c, next) => {
  const projectId = c.req.param("id");
  // passes projectId directly to SQL...
```

This middleware would crash if someone sent a request to `/projects/not-a-uuid/chat`. In practice the frontend never does this, but it's a latent bug. **Low risk** since chat routes require a real project to be meaningful.

### 3. `editor.ts` -- PARTIALLY AT RISK

Same pattern: `/projects/:id/files` and `/projects/:id/files/*`. No UUID validation on `:id`. Would crash on non-UUID input passed to SQL. **Low risk** for same reason.

### 4. `folders.ts` -- LOW RISK

Mounted at `/folders`, so routes are `/folders/:id`. The `/:id` routes (lines 65, 85, 107) pass `:id` directly to `folders.findById(id)` which queries by UUID. A non-UUID `:id` would cause a PostgreSQL error.

However, there are no literal sub-paths under `/folders/` that could collide. **Low risk** unless new features add paths like `/folders/recent`.

### 5. `analytics.ts`, `plan.ts`, `context.ts`, etc. -- LOW RISK

These use `/projects/:id/` prefixed routes (e.g., `/projects/:id/overview`). The suffix prevents collision with dashboard-level routes. A non-UUID `:id` would still crash the SQL query but won't be triggered by normal navigation.

## Recommendations

### High Priority
None -- Bug A is already fixed.

### Medium Priority
1. **Add UUID validation to `projects.ts` `:id` routes**: Add a shared middleware or per-route check so `/projects/garbage` returns 404 instead of 500.
2. **Add UUID validation to `chat.ts` auto-join middleware** (line 55): Same UUID_RE pattern as project-files.ts.

### Low Priority
3. **Consider a shared `requireUuidParam` middleware** that could be applied to all route files consistently, avoiding the need to remember per-file.
4. **`folders.ts`**: Add UUID validation if any literal sub-paths are added in the future.

## Conclusion

The fix for Bug A is correct. The `projects.ts` file avoids the collision by ordering literal routes before `/:id`. The remaining risk is minor: non-UUID strings in `:id` params cause PostgreSQL 500 errors rather than clean 404s, but these paths are not reachable from the dashboard UI under normal usage.
