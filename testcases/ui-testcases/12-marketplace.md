# TC-12: Marketplace & Discover

## 12.1 Marketplace (P2)

### TC-12.1.1 — Navigate to marketplace
- **Steps**: Click "Marketplace" in sidebar.
- **Expected**: Marketplace page loads. Categories, featured listings, search bar visible.

### TC-12.1.2 — Browse marketplace categories
- **Steps**: Click through different categories (DevTools, Databases, Analytics, etc.).
- **Expected**: Each category filters listings. Category count matches displayed items.

### TC-12.1.3 — Search marketplace
- **Steps**: Search for "database" in marketplace.
- **Expected**: Relevant listings shown (Supabase, Firebase, etc.). Results update as you type.

### TC-12.1.4 — View listing details
- **Steps**: Click on a marketplace listing.
- **Expected**: Detail page with description, features, reviews, install button.

### TC-12.1.5 — Install marketplace item
- **Steps**: Click "Install" on a marketplace listing.
- **Expected**: Item installed/added to workspace. Confirmation shown. Available in environment settings.

### TC-12.1.6 — Uninstall marketplace item
- **Steps**: Find installed item → click "Uninstall".
- **Expected**: Item removed. No longer available in workspace. Confirmation dialog first.

### TC-12.1.7 — Marketplace item reviews
- **Steps**: View reviews on a listing.
- **Expected**: Reviews shown with rating, user, text, date.

## 12.2 Discover (P2)

### TC-12.2.1 — Browse discover page
- **Steps**: Click "Discover" in sidebar.
- **Expected**: Public projects displayed. Grid or list view. Sorted by popularity/recent.

### TC-12.2.2 — View public project
- **Steps**: Click on a public project.
- **Expected**: Project preview loads. Can see code, preview, and project details.

### TC-12.2.3 — Fork/clone public project
- **Steps**: On a public project, click Fork/Use/Clone.
- **Expected**: Copy created in user's workspace. Full project with all files.

### TC-12.2.4 — Search discover
- **Steps**: Search for "calculator" in discover.
- **Expected**: Public projects matching "calculator" shown. Results relevant.

## 12.3 Import Project (P1)

### TC-12.3.1 — Import from GitHub
- **Steps**: Click "Import project" → select GitHub → choose repo → import.
- **Expected**: Project created from GitHub repo. All files imported. Preview works.

### TC-12.3.2 — Import project dialog
- **Steps**: Click "Import project" in sidebar.
- **Expected**: Import dialog shows. Options: GitHub import, file upload, or URL.

### TC-12.3.3 — Import with large repo
- **Steps**: Import a GitHub repo with 50+ files.
- **Expected**: All files imported. Progress indicator shown. File tree complete.

## 12.4 Export/Bundle (P3)

### TC-12.4.1 — Export environment as bundle
- **Steps**: If export feature exists, export an environment.
- **Expected**: JSON bundle file downloaded. Contains all environment config, knowledge, skills.

### TC-12.4.2 — Import environment bundle
- **Steps**: Import a previously exported bundle.
- **Expected**: Environment recreated from bundle. All settings intact.
