# 09-marketplace — Test Case Index

Tests for the marketplace: listing browse, install, reviews, moderation, listing creation, categories, and featured bundles.

## Files

| File | Cases | Coverage |
|---|---|---|
| TC-MARKET-LIST.md | 35 | Browse, search, filter, sort, pagination, listing detail, SEO, anonymous access |
| TC-MARKET-INSTALL.md | 35 | Install flow, attribution (project_remixes), install_count, plan limits, bundle integrity |
| TC-MARKET-REVIEW.md | 30 | Reviews (post after install only), edit/delete own, rating recompute, abuse, helpful votes, author replies |
| TC-MARKET-MODERATION.md | 32 | Reports, admin queue, takedown, DMCA flow, appeals, audit logs |
| TC-MARKET-PUBLISH-LISTING.md | 40 | Listing CRUD, draft → published, version bump (semver), bundles, thumbnails, my-listings page |
| TC-MARKET-CATEGORIES-BUNDLES.md | 25 | Categories admin, featured bundles, bundle install fan-out, attribution |

**Total: 197 cases**

## Endpoints Touched
- `GET /marketplace` (list)
- `GET /marketplace/<slug>` (detail)
- `POST /marketplace/listings` (create)
- `PATCH /marketplace/listings/<id>` (edit)
- `POST /marketplace/listings/<id>/publish`
- `POST /marketplace/listings/<id>/unpublish`
- `POST /marketplace/<id>/install`
- `POST /marketplace/reviews`
- `PATCH /marketplace/reviews/<id>`
- `DELETE /marketplace/reviews/<id>`
- `POST /marketplace/reports`
- `GET /admin/marketplace/queue`
- `POST /admin/marketplace/<id>/approve | /reject | /takedown | /restore`
- `POST /marketplace/dmca`
- `GET /marketplace/categories`
- `GET /marketplace/bundles/<slug>`
- `POST /marketplace/bundles/<id>/install`

## Key Tables
- `marketplace_listings`
- `marketplace_reviews`
- `marketplace_reports`
- `marketplace_moderation_queue`
- `marketplace_admin_actions`
- `marketplace_categories`
- `marketplace_bundle_artifacts`
- `marketplace_installs`
- `project_remixes`

## Notes
- Reviews allowed only after install
- Install increments install_count atomically
- Per CLAUDE.md: no "god mode" terminology — use "platform admin"
- Bundles attribute back to all member listings
