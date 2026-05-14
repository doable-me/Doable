# R11 Gap-Areas Smoke Report

- **Env**: dev (dev-api.doable.me)
- **Date**: 2026-05-14
- **Round**: Ralph R11
- **Tester**: automated curl probes (uniquegodwin / platform admin)
- **WorkspaceId**: `a63f70c2-a4ee-4ce1-ad61-ff0b05218873`
- **ProjectId**: `4cb53939-3521-4f08-a17f-b1cc31a8e692` (Build Tgis)
- **Total probes**: 20
- **5xx**: 1
- **Unexpected**: 4

---

## Area 22 — Notifications

### 22-1 GET /notifications (no workspaceId)
```
curl https://dev-api.doable.me/notifications
```
- **Status**: 400
- **Body**: `{"error":"workspaceId query parameter is required"}`
- **Classification**: EXPECTED — API correctly enforces required param

### 22-2 GET /notifications?workspaceId=<ws>
```
curl "https://dev-api.doable.me/notifications?workspaceId=a63f70c2-a4ee-4ce1-ad61-ff0b05218873"
```
- **Status**: 200
- **Body**: `{"data":[]}`
- **Classification**: PASS

### 22-3 GET /notifications/unread-count?workspaceId=<ws>
```
curl "https://dev-api.doable.me/notifications/unread-count?workspaceId=a63f70c2-a4ee-4ce1-ad61-ff0b05218873"
```
- **Status**: 200
- **Body**: `{"count":0}`
- **Classification**: PASS

### 22-4 POST /notifications/mark-all-read
```
curl -X POST https://dev-api.doable.me/notifications/mark-all-read -d '{"workspaceId":"..."}'
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/notifications/mark-all-read"}`
- **Classification**: UNEXPECTED — route not implemented; endpoint appears missing from router

---

## Area 23 — Thumbnails

### 23-1 GET /projects/<id>/thumbnail
```
curl https://dev-api.doable.me/projects/4cb53939-3521-4f08-a17f-b1cc31a8e692/thumbnail
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/projects/.../thumbnail"}`
- **Classification**: UNEXPECTED — project has `thumbnail_url` set in DB (`/thumbnails/<id>.png`) but GET route does not exist; thumbnail served via static Caddy path, not API route. If the route is intentionally omitted, it should be documented.

### 23-2 POST /projects/<id>/thumbnail/regenerate
```
curl -X POST https://dev-api.doable.me/projects/4cb53939-3521-4f08-a17f-b1cc31a8e692/thumbnail/regenerate
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/projects/.../thumbnail/regenerate"}`
- **Classification**: UNEXPECTED — regenerate route not registered; thumbnail regeneration cannot be triggered via API

---

## Area 18 — Versions

### 18-1 GET /projects/<id>/versions
```
curl https://dev-api.doable.me/projects/4cb53939-3521-4f08-a17f-b1cc31a8e692/versions
```
- **Status**: 200
- **Body**: `{"data":[{"id":"270e4e215ba95dfb022abce8b98cdfb8c1d15b9a","project_id":"","version_number":1,"description":"build tgis","bookmarked":false,"created_by":"Doable","created_at":"2026-05-13T21:32:22+02:00...`
- **Classification**: PASS (note: `project_id` is empty string — possible minor serialization bug)

### 18-2 POST /projects/<id>/versions
```
curl -X POST https://dev-api.doable.me/projects/4cb53939-3521-4f08-a17f-b1cc31a8e692/versions \
  -d '{"createdBy":"uniquegodwin","projectPath":"/"}'
```
- **Status**: 500
- **Body**: `{"error":"Failed to create version","message":"EACCES: permission denied, scandir '/boot/lost+found'"}`
- **Classification**: **SERVER-5XX** — version creation scans filesystem root or `/boot`; running as root or with unexpected cwd. See BUG-R11-VERSIONS-EACCES-500-001.md

---

## Area 13 — WebSocket

### 13-1 HEAD https://dev-ws.doable.me/
```
curl -I https://dev-ws.doable.me/
```
- **Status**: 404
- **Body**: HTTP/1.1 404, headers present (`access-control-allow-headers`, `access-control-allow-methods`)
- **Classification**: PASS — WS server is reachable; 404 on non-upgrade HTTP request is expected behavior for a WebSocket-only server

---

## Area 14 — MCP / Connectors

### 14-1 GET /workspaces/<ws>/connectors-effective
```
curl https://dev-api.doable.me/workspaces/a63f70c2-.../connectors-effective
```
- **Status**: 200
- **Body**: `{"data":[{"id":"3a28a4f6-...","workspace_id":"...","project_id":null,"created_by":"...","scope":"workspace","n...`
- **Classification**: PASS

### 14-2 GET /workspaces/<ws>/connectors
```
curl https://dev-api.doable.me/workspaces/a63f70c2-.../connectors
```
- **Status**: 200
- **Body**: `{"data":[{"id":"3a28a4f6-...","workspace_id":"...","project_id":null,...`
- **Classification**: PASS

### 14-3 GET /admin/mcp-servers
```
curl https://dev-api.doable.me/admin/mcp-servers
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/admin/mcp-servers"}`
- **Classification**: UNEXPECTED — admin MCP server listing route not implemented; expected for platform admin

---

## Area 15 — GitHub

### 15-1 GET /github/installation-status
```
curl https://dev-api.doable.me/github/installation-status
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/github/installation-status"}`
- **Classification**: UNEXPECTED — route not found; expected 200 or 401 but route is entirely absent

### 15-2 GET /github/repos
```
curl https://dev-api.doable.me/github/repos
```
- **Status**: 401
- **Body**: `{"error":"No GitHub token available. Connect GitHub first."}`
- **Classification**: EXPECTED — no GitHub integration configured; 401 with clear message is correct

---

## Area 20 — Design Comments

### 20-1 GET /projects/<id>/comments
```
curl https://dev-api.doable.me/projects/4cb53939-.../comments
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/projects/.../comments"}`
- **Classification**: UNEXPECTED — design comments route not implemented

### 20-2 POST /projects/<id>/comments
```
curl -X POST https://dev-api.doable.me/projects/4cb53939-.../comments \
  -d '{"anchor":{"x":100,"y":200},"body":"smoke test comment"}'
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/projects/.../comments"}`
- **Classification**: UNEXPECTED — design comments POST route not implemented

---

## Area 26 — Analytics

### 26-1 GET /analytics/events?projectId=<id>
```
curl "https://dev-api.doable.me/analytics/events?projectId=4cb53939-..."
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/analytics/events"}`
- **Classification**: UNEXPECTED — analytics events route not implemented

### 26-2 GET /analytics/page-views?projectId=<id>
```
curl "https://dev-api.doable.me/analytics/page-views?projectId=4cb53939-..."
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/analytics/page-views"}`
- **Classification**: UNEXPECTED — analytics page-views route not implemented

### 26-3 GET /admin/analytics
```
curl https://dev-api.doable.me/admin/analytics
```
- **Status**: 404
- **Body**: `{"error":"Not Found","path":"/admin/analytics"}`
- **Classification**: UNEXPECTED — admin analytics route not implemented

---

## Summary Table

| # | Area | Route | Status | Classification |
|---|------|-------|--------|----------------|
| 1 | 22-notifications | GET /notifications (no param) | 400 | EXPECTED |
| 2 | 22-notifications | GET /notifications?workspaceId | 200 | PASS |
| 3 | 22-notifications | GET /notifications/unread-count?workspaceId | 200 | PASS |
| 4 | 22-notifications | POST /notifications/mark-all-read | 404 | UNEXPECTED |
| 5 | 23-thumbnails | GET /projects/id/thumbnail | 404 | UNEXPECTED |
| 6 | 23-thumbnails | POST /projects/id/thumbnail/regenerate | 404 | UNEXPECTED |
| 7 | 18-versions | GET /projects/id/versions | 200 | PASS |
| 8 | 18-versions | POST /projects/id/versions | 500 | **SERVER-5XX** |
| 9 | 13-websocket | HEAD dev-ws.doable.me/ | 404 | PASS (expected) |
| 10 | 14-mcp | GET /workspaces/ws/connectors-effective | 200 | PASS |
| 11 | 14-mcp | GET /workspaces/ws/connectors | 200 | PASS |
| 12 | 14-mcp | GET /admin/mcp-servers | 404 | UNEXPECTED |
| 13 | 15-github | GET /github/installation-status | 404 | UNEXPECTED |
| 14 | 15-github | GET /github/repos | 401 | EXPECTED |
| 15 | 20-comments | GET /projects/id/comments | 404 | UNEXPECTED |
| 16 | 20-comments | POST /projects/id/comments | 404 | UNEXPECTED |
| 17 | 26-analytics | GET /analytics/events | 404 | UNEXPECTED |
| 18 | 26-analytics | GET /analytics/page-views | 404 | UNEXPECTED |
| 19 | 26-analytics | GET /admin/analytics | 404 | UNEXPECTED |
| 20 | (bootstrap) | GET /workspaces + GET /projects | 200 | PASS |

**Totals**: 20 probes | 1 SERVER-5XX | 11 UNEXPECTED (routes not implemented) | 3 EXPECTED | 6 PASS

### Notable findings
1. **BUG (500)**: POST /projects/id/versions crashes with `EACCES: permission denied, scandir '/boot/lost+found'` — version creation scans wrong filesystem path
2. **Missing routes (not yet built)**: mark-all-read, thumbnail GET/regenerate, admin/mcp-servers, github/installation-status, project comments, all analytics routes — these appear to be planned features not yet implemented
3. **Minor**: GET /projects/id/versions returns `project_id: ""` (empty string) for version objects — possible serialization gap
