# TC-MARKET-CATEGORIES-BUNDLES — Marketplace categories and featured bundles

Covers `marketplace_categories` admin CRUD, displaying categories on browse, and `marketplace_bundle_artifacts` featured-bundle curation.

---

## TC-MARKET-CATEGORIES-001
**Title:** Default categories seeded on fresh install
**Pre:** Fresh database
**Steps:**
1. Run migrations + seed
2. GET /marketplace/categories
**Expected:** Returns at least: Productivity, Design, AI, Dev Tools, Education, Games, Marketing, Other.
**Severity:** Medium

## TC-MARKET-CATEGORIES-002
**Title:** Category contains slug, name, icon, sort_order
**Pre:** N/A
**Steps:**
1. Inspect category row
**Expected:** Columns: id, slug, name, description, icon, sort_order, listings_count.
**Severity:** Low

## TC-MARKET-CATEGORIES-003
**Title:** Admin can create new category
**Pre:** Admin user
**Steps:**
1. Open admin → Categories → New
2. Provide name "Robotics"
**Expected:** Slug auto-generated `robotics`; row inserted.
**Severity:** Medium

## TC-MARKET-CATEGORIES-004
**Title:** Admin can edit category name/icon
**Pre:** Existing category
**Steps:**
1. Edit, save
**Expected:** Updated; cache busted.
**Severity:** Low

## TC-MARKET-CATEGORIES-005
**Title:** Admin can hide a category
**Pre:** Empty category
**Steps:**
1. Toggle visibility off
**Expected:** Hidden from browse; existing listings still tagged.
**Severity:** Low

## TC-MARKET-CATEGORIES-006
**Title:** Admin cannot delete category with active listings
**Pre:** Category has listings
**Steps:**
1. Delete
**Expected:** 409 "Reassign listings before deleting".
**Severity:** Medium

## TC-MARKET-CATEGORIES-007
**Title:** Category sort_order respected on browse
**Pre:** Categories have explicit sort_order
**Steps:**
1. Browse
**Expected:** Categories shown in sort order.
**Severity:** Low

## TC-MARKET-CATEGORIES-008
**Title:** Category listings_count auto-updated
**Pre:** N/A
**Steps:**
1. Publish 3 listings in category
**Expected:** Category.listings_count = 3 (via trigger or recompute).
**Severity:** Medium

## TC-MARKET-CATEGORIES-009
**Title:** Listing assignable to one or many categories
**Pre:** N/A
**Steps:**
1. Assign listing to "Productivity" + "Dev Tools"
**Expected:** Both relationships saved (junction table).
**Severity:** Medium

## TC-MARKET-CATEGORIES-010
**Title:** Category-specific featured bundles
**Pre:** N/A
**Steps:**
1. Admin creates bundle "Best AI Tools" within AI category
**Expected:** Visible on /marketplace?category=ai → Featured rail.
**Severity:** Low

---

## TC-MARKET-BUNDLES-011
**Title:** Featured bundle creation by admin
**Pre:** Admin
**Steps:**
1. Open admin → Bundles → New
2. Pick listings, set name, hero image
**Expected:** marketplace_bundle_artifacts row stores bundle metadata + member list.
**Severity:** Medium

## TC-MARKET-BUNDLES-012
**Title:** Bundle visible on marketplace homepage
**Pre:** Featured bundle exists
**Steps:**
1. Visit /marketplace
**Expected:** Bundle card in "Featured" rail; clickable.
**Severity:** Medium

## TC-MARKET-BUNDLES-013
**Title:** Bundle detail shows member listings
**Pre:** Bundle of 3
**Steps:**
1. Click
**Expected:** Detail page shows 3 listings + bundle description + "Install all" button.
**Severity:** Medium

## TC-MARKET-BUNDLES-014
**Title:** Bundle updates respect listing changes
**Pre:** Listing in bundle gets updated
**Steps:**
1. Listing v2 published
**Expected:** Bundle automatically references latest version unless pinned.
**Severity:** Medium

## TC-MARKET-BUNDLES-015
**Title:** Bundle pinned to specific listing versions
**Pre:** Admin pinned to v1.2.0
**Steps:**
1. Listing publishes v2.0
**Expected:** Bundle still points to v1.2.0.
**Severity:** Low

## TC-MARKET-BUNDLES-016
**Title:** Bundle install creates one project per member listing
**Pre:** N/A
**Steps:**
1. Click Install all
**Expected:** N projects created; remix rows for each linking to source listing.
**Severity:** High

## TC-MARKET-BUNDLES-017
**Title:** Bundle members removable by admin
**Pre:** Bundle of 3
**Steps:**
1. Admin removes one
**Expected:** Bundle now has 2 members.
**Severity:** Low

## TC-MARKET-BUNDLES-018
**Title:** Bundle discontinued (status=archived)
**Pre:** Active bundle
**Steps:**
1. Admin archives
**Expected:** Hidden from marketplace; existing references still resolve to archived state.
**Severity:** Low

## TC-MARKET-BUNDLES-019
**Title:** Bundle install respects per-listing plan/payment
**Pre:** Bundle includes a paid listing
**Steps:**
1. Free user clicks Install all
**Expected:** Modal: "Bundle includes 1 paid listing ($9.99). Proceed?". Single checkout for all.
**Severity:** Medium

## TC-MARKET-BUNDLES-020
**Title:** Bundle authorship credit displayed
**Pre:** Bundle has multiple authors
**Steps:**
1. Detail
**Expected:** Each member listing's author credited.
**Severity:** Low

## TC-MARKET-BUNDLES-021
**Title:** Anonymous can browse bundles
**Pre:** Logged out
**Steps:**
1. Visit /marketplace/bundles/<slug>
**Expected:** Visible; install requires login.
**Severity:** Low

## TC-MARKET-BUNDLES-022
**Title:** Featured bundle reorder by admin (drag/drop)
**Pre:** Multiple bundles
**Steps:**
1. Drag to reorder
**Expected:** sort_order persisted; immediate UI update.
**Severity:** Low

## TC-MARKET-BUNDLES-023
**Title:** Bundle hero image responsive
**Pre:** N/A
**Steps:**
1. View on mobile/desktop
**Expected:** Image scaled appropriately; no broken layout.
**Severity:** Low

## TC-MARKET-BUNDLES-024
**Title:** Bundle install attribution preserved per member
**Pre:** Install bundle of 3
**Steps:**
1. Inspect project_remixes
**Expected:** Three rows, each linking new project to its source listing.
**Severity:** High

## TC-MARKET-BUNDLES-025
**Title:** Bundle feed by category
**Pre:** N/A
**Steps:**
1. GET /marketplace/categories/<slug>/bundles
**Expected:** Returns category-specific bundles.
**Severity:** Low
