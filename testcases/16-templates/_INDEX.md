# 16-templates — Test Case Index

Tests for templates: registry, list, scaffold, custom (workspace) templates, thumbnails.

## Files

| File | Cases | Coverage |
|---|---|---|
| TC-TEMPL-LIST.md | 25 | List templates, filter by framework/category, preview, deprecation, public read |
| TC-TEMPL-SCAFFOLD.md | 35 | Scaffold flow, parameter substitution, conflict resolution, sandbox safety, framework-agnostic init |
| TC-TEMPL-CUSTOM.md | 20 | Workspace-private templates CRUD, sharing, permission, snapshot from project |
| TC-TEMPL-REGISTRY.md | 20 | Server-side registry loader, refresh endpoint, manifest validation, integrity |
| TC-TEMPL-THUMBNAILS.md | 15 | Thumbnail upload + auto-generation via Puppeteer, fallback, EXIF stripping |

**Total: 115 cases**

## Endpoints Touched
- `GET /templates`
- `GET /templates/<id>`
- `POST /templates/<id>/scaffold`
- `POST /workspaces/<wid>/templates` (custom create)
- `PATCH /workspaces/<wid>/templates/<id>`
- `DELETE /workspaces/<wid>/templates/<id>`
- `POST /admin/templates/refresh`
- `GET /static/templates/<id>/<asset>`
- `PATCH /templates/<id>/thumbnail`

## Key Files / Tables
- Server-side registry: `services/api/src/templates/`
- `workspace_templates` (custom templates per workspace)
- Manifests use JSON-Schema for parameter validation

## Notes
- Default seeded: Next.js, Vite, Python WSGI, plus blog/dashboard/e-commerce starters
- Per CLAUDE.md: Puppeteer/Chrome for thumbnail generation
- Framework-agnostic init contract per devframeworkPRD/00,07,08,09
- Custom templates honor workspace plan limits; secrets stripped
