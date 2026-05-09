# TC-MARKET-LIST — List, search, filter, and view marketplace listings

Covers the public marketplace browse experience: listing index, search, categories, sort, pagination, and listing detail pages.

---

## TC-MARKET-LIST-001
**Title:** Anonymous user can browse marketplace
**Pre:** Logged out
**Steps:**
1. Visit /marketplace
**Expected:** Listings page loads; shows public, published listings only. No auth wall.
**Severity:** Critical

## TC-MARKET-LIST-002
**Title:** Listing card shows core fields
**Pre:** At least one published listing
**Steps:**
1. Inspect a card
**Expected:** Thumbnail, title, author, install count, average rating (★ count), short description, price (or Free).
**Severity:** High

## TC-MARKET-LIST-003
**Title:** Search by keyword in title
**Pre:** Listing "Todo Pro" exists
**Steps:**
1. Search "todo"
**Expected:** Returns "Todo Pro" first; case-insensitive match.
**Severity:** High

## TC-MARKET-LIST-004
**Title:** Search by keyword in description
**Pre:** Listing description "fast static portfolio"
**Steps:**
1. Search "portfolio"
**Expected:** Returns the listing; full-text/trigram index used.
**Severity:** Medium

## TC-MARKET-LIST-005
**Title:** Search by tag
**Pre:** Listings tagged `react`, `vue`
**Steps:**
1. Search `tag:react` or click tag chip
**Expected:** Filters to react-tagged only.
**Severity:** Medium

## TC-MARKET-LIST-006
**Title:** Filter by category
**Pre:** Categories: Productivity, Design, AI
**Steps:**
1. Click "Productivity"
**Expected:** Only listings in that category. URL reflects `?category=productivity`.
**Severity:** High

## TC-MARKET-LIST-007
**Title:** Sort by most installed
**Pre:** Listings with varying install counts
**Steps:**
1. Sort: Most Installed
**Expected:** Highest install_count first; ties broken by created_at desc.
**Severity:** Medium

## TC-MARKET-LIST-008
**Title:** Sort by highest rated
**Pre:** Listings with varying ratings
**Steps:**
1. Sort: Highest Rated
**Expected:** Highest avg_rating first; min review count threshold (e.g., ≥3 reviews) to qualify.
**Severity:** Medium

## TC-MARKET-LIST-009
**Title:** Sort by newest
**Pre:** N/A
**Steps:**
1. Sort: Newest
**Expected:** Order by published_at desc.
**Severity:** Medium

## TC-MARKET-LIST-010
**Title:** Pagination — 24 per page
**Pre:** 50 listings
**Steps:**
1. Browse page 1
2. Click Page 2
**Expected:** Page 1 = 24 items; page 2 = next 24. Cursor or offset pagination consistent under inserts.
**Severity:** Medium

## TC-MARKET-LIST-011
**Title:** Empty state when no results
**Pre:** Search "zzzzzznoresult"
**Steps:**
1. Search
**Expected:** Empty illustration + message "No listings match" + reset filters button.
**Severity:** Low

## TC-MARKET-LIST-012
**Title:** Listing detail page from card click
**Pre:** Card visible
**Steps:**
1. Click card
**Expected:** Navigate to `/marketplace/<slug>`. Detail shows full description, screenshots, README, install button, reviews, version history.
**Severity:** High

## TC-MARKET-LIST-013
**Title:** Detail page shows author profile link
**Pre:** Listing
**Steps:**
1. Click author name
**Expected:** Navigate to author's marketplace profile listing all their listings.
**Severity:** Low

## TC-MARKET-LIST-014
**Title:** Detail page shows version history
**Pre:** Listing has v1.0.0, v1.1.0, v2.0.0
**Steps:**
1. Click "Versions"
**Expected:** All versions listed with changelog, published_at, can install specific version.
**Severity:** Medium

## TC-MARKET-LIST-015
**Title:** Detail page screenshots zoomable
**Pre:** Listing has 3 screenshots
**Steps:**
1. Click thumbnail
**Expected:** Lightbox opens; arrow keys navigate.
**Severity:** Low

## TC-MARKET-LIST-016
**Title:** Detail page README rendered as markdown
**Pre:** Listing has README.md
**Steps:**
1. Scroll to README section
**Expected:** Headings, code blocks, lists, links, images render correctly. Sanitized HTML — no script tags executed.
**Severity:** High

## TC-MARKET-LIST-017
**Title:** Listings draft not visible publicly
**Pre:** Author has draft listing
**Steps:**
1. Anonymous browses /marketplace
**Expected:** Draft not in results. Direct URL returns 404.
**Severity:** Critical

## TC-MARKET-LIST-018
**Title:** Listings unpublished not visible publicly
**Pre:** Listing previously published, now unpublished
**Steps:**
1. Anonymous browses
**Expected:** Not in results. Direct URL returns 410 Gone or 404.
**Severity:** High

## TC-MARKET-LIST-019
**Title:** Listings under moderation flagged "in review" — hidden until approved
**Pre:** Listing in `pending_review`
**Steps:**
1. Anonymous browses
**Expected:** Not visible.
**Severity:** Critical

## TC-MARKET-LIST-020
**Title:** Featured bundles surfaced at top
**Pre:** 2 bundles marked featured
**Steps:**
1. Visit /marketplace
**Expected:** "Featured" rail shows them first; sortable by curator order.
**Severity:** Medium

## TC-MARKET-LIST-021
**Title:** Categories list endpoint
**Pre:** /marketplace/categories
**Steps:**
1. GET
**Expected:** Returns categories with counts. Cached 5 min.
**Severity:** Medium

## TC-MARKET-LIST-022
**Title:** Trigram fuzzy search ("dahsboard" matches "dashboard")
**Pre:** Listing titled "Dashboard Kit"
**Steps:**
1. Search "dahsboard"
**Expected:** Match returned (typo-tolerant via pg_trgm).
**Severity:** Low

## TC-MARKET-LIST-023
**Title:** Combined filters — category + tag + sort
**Pre:** Listings matching combinations
**Steps:**
1. Apply category=ai, tag=chatbot, sort=newest
**Expected:** Correct intersection results; URL encodes all 3.
**Severity:** Medium

## TC-MARKET-LIST-024
**Title:** Listing card lazy-loads thumbnail
**Pre:** N/A
**Steps:**
1. Inspect HTML
**Expected:** `<img loading="lazy">` for off-screen thumbnails. Performance impact small.
**Severity:** Low

## TC-MARKET-LIST-025
**Title:** Listing detail metadata for SEO
**Pre:** Listing detail
**Steps:**
1. View source
**Expected:** Open Graph tags (og:title, og:image, og:description), JSON-LD product schema, canonical URL.
**Severity:** Low

## TC-MARKET-LIST-026
**Title:** Listing slug stable
**Pre:** Listing slug `todo-pro`
**Steps:**
1. Edit listing title to "Todo Pro 2"
**Expected:** Slug remains `todo-pro` (or auto-generates with old kept as redirect). Existing links not broken.
**Severity:** Medium

## TC-MARKET-LIST-027
**Title:** Listing slug uniqueness enforced
**Pre:** Slug `todo-pro` exists
**Steps:**
1. Author tries to create another with same slug
**Expected:** 409 with suggestion.
**Severity:** Medium

## TC-MARKET-LIST-028
**Title:** Search query length cap
**Pre:** N/A
**Steps:**
1. Search 500-char string
**Expected:** Truncated to 100; no DB hammering.
**Severity:** Low

## TC-MARKET-LIST-029
**Title:** Marketplace search rate limit
**Pre:** Default 30 req/min/ip
**Steps:**
1. Burst 100 searches
**Expected:** 429 after limit.
**Severity:** Low

## TC-MARKET-LIST-030
**Title:** XSS in listing title escaped
**Pre:** Listing title `<script>alert(1)</script>` (allowed at create? Should not)
**Steps:**
1. Create attempt
**Expected:** Server strips/encodes; even if stored, render escapes. No alert fired.
**Severity:** Critical

## TC-MARKET-LIST-031
**Title:** Listing price displayed correctly
**Pre:** Listing priced $9.99 USD
**Steps:**
1. Browse
**Expected:** Card shows "$9.99" with currency. Free listings show "Free" badge.
**Severity:** Medium

## TC-MARKET-LIST-032
**Title:** Listings with refundable flag display
**Pre:** Paid listing with refund-window=14d
**Steps:**
1. Detail
**Expected:** "14-day refund" badge.
**Severity:** Low

## TC-MARKET-LIST-033
**Title:** Bundle expansion view
**Pre:** Featured bundle "Starter Pack" with 5 listings
**Steps:**
1. Click bundle
**Expected:** Detail shows all 5 contained listings; install all button.
**Severity:** Medium

## TC-MARKET-LIST-034
**Title:** Listings paginated load-more works on infinite scroll
**Pre:** N/A
**Steps:**
1. Scroll to bottom
**Expected:** Next page auto-loaded; loading skeleton briefly visible.
**Severity:** Low

## TC-MARKET-LIST-035
**Title:** Listing detail OpenAPI/feed (RSS or JSON feed)
**Pre:** N/A
**Steps:**
1. GET /marketplace/feed.json
**Expected:** Returns recent listings as JSON Feed format. Useful for external dashboards.
**Severity:** Low
