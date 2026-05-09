# TC-TEMPL-THUMBNAILS — Template thumbnails: generation, serving, fallback

Covers thumbnail upload (custom templates) and auto-generation (built-in via Puppeteer per CLAUDE.md).

---

## TC-TEMPL-THUMBNAILS-001
**Title:** Built-in template thumbnail served from /static/templates/<id>.png
**Pre:** Built-in templates seeded
**Steps:**
1. GET URL
**Expected:** 200, image/png; ~512x320 hero size.
**Severity:** High

## TC-TEMPL-THUMBNAILS-002
**Title:** Auto-generated thumbnail via Puppeteer for built-in
**Pre:** Generation script
**Steps:**
1. Run generator
**Expected:** Headless Chrome renders demo URL; screenshot saved; PNG ≤ 200KB.
**Severity:** Medium

## TC-TEMPL-THUMBNAILS-003
**Title:** Thumbnail fallback when missing
**Pre:** Template with no thumbnail
**Steps:**
1. Browse
**Expected:** Generic placeholder image used.
**Severity:** Low

## TC-TEMPL-THUMBNAILS-004
**Title:** Custom template thumbnail upload
**Pre:** Workspace admin
**Steps:**
1. Upload PNG
**Expected:** Stored; URL returned; lossless saved.
**Severity:** Medium

## TC-TEMPL-THUMBNAILS-005
**Title:** Thumbnail upload size cap
**Pre:** 2MB cap
**Steps:**
1. Upload 5MB
**Expected:** 413.
**Severity:** Low

## TC-TEMPL-THUMBNAILS-006
**Title:** Thumbnail format validation
**Pre:** N/A
**Steps:**
1. Upload PDF
**Expected:** 415; only image/png|jpeg|webp.
**Severity:** Low

## TC-TEMPL-THUMBNAILS-007
**Title:** Thumbnail dimensions auto-resized
**Pre:** Upload 2000x2000
**Steps:**
1. Upload
**Expected:** Resized to ≤1024 longest side; aspect preserved.
**Severity:** Low

## TC-TEMPL-THUMBNAILS-008
**Title:** Thumbnail responsive variants generated (1x, 2x)
**Pre:** N/A
**Steps:**
1. Inspect storage
**Expected:** thumb.png, thumb@2x.png; client uses srcset.
**Severity:** Low

## TC-TEMPL-THUMBNAILS-009
**Title:** Thumbnail cache headers
**Pre:** N/A
**Steps:**
1. curl -I
**Expected:** Cache-Control public, max-age long; etag.
**Severity:** Low

## TC-TEMPL-THUMBNAILS-010
**Title:** Thumbnail server-side strip EXIF
**Pre:** Upload with EXIF GPS
**Steps:**
1. Upload
**Expected:** EXIF stripped on save (privacy).
**Severity:** Medium

## TC-TEMPL-THUMBNAILS-011
**Title:** Thumbnail Puppeteer runs in sandbox
**Pre:** N/A
**Steps:**
1. Inspect process
**Expected:** Puppeteer process has limited capabilities; no host network access beyond the demo URL.
**Severity:** High

## TC-TEMPL-THUMBNAILS-012
**Title:** Thumbnail generation cleanup on failure
**Pre:** Puppeteer crashes
**Steps:**
1. Generate
**Expected:** Tmp files cleaned; placeholder retained.
**Severity:** Low

## TC-TEMPL-THUMBNAILS-013
**Title:** Thumbnail update endpoint replaces image
**Pre:** Existing thumbnail
**Steps:**
1. PATCH /templates/<id>/thumbnail
**Expected:** Replaced; cache busted via filename hash.
**Severity:** Low

## TC-TEMPL-THUMBNAILS-014
**Title:** Thumbnail deletion (admin)
**Pre:** Custom template
**Steps:**
1. DELETE thumbnail
**Expected:** Removed; UI shows fallback.
**Severity:** Low

## TC-TEMPL-THUMBNAILS-015
**Title:** Thumbnail OG meta for marketplace listing parity
**Pre:** Template referenced from listing
**Steps:**
1. View HTML head
**Expected:** og:image points to thumbnail.
**Severity:** Low
