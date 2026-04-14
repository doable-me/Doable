# TC-10: Sharing, Publishing & Thumbnails

## 10.1 Share Project (P1)

### TC-10.1.1 — Open share dialog
- **Steps**: On project card or in editor, click Share button.
- **Expected**: Share dialog opens with options: link sharing toggle, collaborator management, visibility settings.

### TC-10.1.2 — Enable link sharing
- **Steps**: In share dialog, toggle "Share via link" on.
- **Expected**: Shareable link generated. Link displayed with copy button.

### TC-10.1.3 — Copy share link
- **Steps**: Click "Copy link" in share dialog.
- **Expected**: Link copied to clipboard. Toast notification "Link copied".

### TC-10.1.4 — Share link access
- **Steps**: Open the share link in a new incognito window.
- **Expected**: Project preview/view accessible. Visitor can view but not edit (unless configured otherwise).

### TC-10.1.5 — Share project via email
- **Steps**: In share dialog, enter an email → select role (Editor/Viewer) → send invite.
- **Expected**: Invitation sent (or added). Recipient gets access after accepting.

### TC-10.1.6 — Change collaborator role
- **Steps**: In share dialog, change a collaborator's role from Editor to Viewer.
- **Expected**: Role updated. Collaborator's permissions change immediately.

### TC-10.1.7 — Remove collaborator
- **Steps**: In share dialog, remove a collaborator.
- **Expected**: Collaborator removed. They lose access immediately.

### TC-10.1.8 — Share stats
- **Steps**: After sharing, check share analytics (views, unique visitors).
- **Expected**: Stats shown with view count, visitor count, referral sources.

## 10.2 Publishing (P0)

### TC-10.2.1 — Open publish dialog
- **Steps**: Click "Publish" button in editor toolbar.
- **Expected**: Publish dialog opens with deployment wizard steps.

### TC-10.2.2 — Publish to Doable Cloud
- **Steps**: In publish wizard, select "Doable Cloud" → configure → publish.
- **Expected**: Deployment starts. Progress shown. On completion, live URL provided (e.g., `projectname.doable.me`).

### TC-10.2.3 — Visit published site
- **Steps**: Click the published URL.
- **Expected**: Site loads at the subdomain. All features work. Matches preview.

### TC-10.2.4 — Update published site
- **Steps**: Make changes in editor → re-publish.
- **Expected**: Published site updates. Changes visible at the same URL.

### TC-10.2.5 — Publish vs Preview mode
- **Steps**: Check if there are separate "Live" and "Test" publish options.
- **Expected**: Can publish to production (live) or preview/staging. Different URLs if both supported.

### TC-10.2.6 — Unpublish
- **Steps**: If available, unpublish a live site.
- **Expected**: Site taken down. URL returns 404 or "Site not found".

## 10.3 Custom Domains (P2)

### TC-10.3.1 — Add custom domain
- **Steps**: In project settings → Custom Domains → add domain.
- **Expected**: Domain added. DNS configuration instructions shown (CNAME record).

### TC-10.3.2 — Domain DNS verification
- **Steps**: After configuring DNS, click "Verify".
- **Expected**: DNS check runs. Shows "Verified ✓" if DNS correct, or error with instructions if not.

### TC-10.3.3 — SSL for custom domain
- **Steps**: After domain verified, check if HTTPS works.
- **Expected**: SSL certificate auto-provisioned. Site accessible via https://.

### TC-10.3.4 — Remove custom domain
- **Steps**: Delete custom domain from project settings.
- **Expected**: Domain removed. Traffic returns to default subdomain.

## 10.4 Thumbnails (P1)

### TC-10.4.1 — Thumbnail auto-generation
- **Steps**: Create a project and build something. Go back to dashboard.
- **Expected**: Project card shows a thumbnail/screenshot of the app. Not a generic placeholder.

### TC-10.4.2 — Thumbnail updates after changes
- **Steps**: Significantly change the project's UI → return to dashboard.
- **Expected**: Thumbnail reflects new UI (may take a moment to regenerate).

### TC-10.4.3 — Thumbnail for different project types
- **Steps**: Check thumbnails for: simple HTML page, React app, dashboard template.
- **Expected**: Each thumbnail is unique and represents the actual project content.

### TC-10.4.4 — Fallback for failed thumbnail
- **Steps**: Check projects where thumbnail generation may have failed.
- **Expected**: Shows a placeholder with project initials/logo. Not a broken image icon.

## 10.5 Project Visibility (P1)

### TC-10.5.1 — Set project to public
- **Steps**: In project settings, change visibility to "Public".
- **Expected**: Project listed in Discover page. Anyone with link can view.

### TC-10.5.2 — Set project to private
- **Steps**: Change visibility to "Private/Restricted".
- **Expected**: Project hidden from Discover. Only invited collaborators can access.

### TC-10.5.3 — Access control enforcement
- **Steps**: Share a private project link with a non-collaborator.
- **Expected**: Non-collaborator sees "Access denied" or login prompt. Cannot view project.

## 10.6 Discover Public Projects (P1)

### TC-10.6.1 — Browse Discover page
- **Steps**: Click "Discover" in sidebar.
- **Expected**: Public projects listed. Cards with thumbnails, titles, creator info.

### TC-10.6.2 — Open public project
- **Steps**: Click on a public project in Discover.
- **Expected**: Project preview/details page loads. Can view code and preview.

### TC-10.6.3 — Clone/fork public project
- **Steps**: On a public project, click "Use" or "Fork".
- **Expected**: Project duplicated to user's workspace as a new project. Editable copy.
