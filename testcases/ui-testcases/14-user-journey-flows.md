# TC-14: End-to-End User Journey Flows

These are complete user journeys representing real-world personas using Doable from start to finish.

---

## 14.1 Journey: Creative Designer — Portfolio Site (P0)

**Persona**: A freelance designer who wants to build a portfolio website to showcase their work.

### Steps:
1. **Land on dashboard** → Sees greeting and input
2. **Attach wireframe** → Upload a hand-drawn wireframe of portfolio layout
3. **Type prompt**: "Build a portfolio website from this wireframe. Include a hero section with my name and tagline, a project gallery with hover effects, an about me section with a photo, and a contact form with email validation."
4. **Click Build** → Wait for AI to generate
5. **Review preview** → Check layout matches wireframe
6. **Chat follow-up #1**: "Make the project gallery use a masonry layout with category filtering"
7. **Chat follow-up #2**: "Add smooth scroll animations when scrolling to each section"
8. **Chat follow-up #3**: "Change the color scheme to dark mode with accent color #6366F1"
9. **Switch to mobile preview** → Verify responsive design
10. **Manual code edit** → Tweak spacing in CSS file
11. **Publish** → Deploy to Doable Cloud
12. **Visit published URL** → Verify live site works
13. **Share** → Get share link, share with a friend for feedback
14. **Star** → Star the project for quick access

**Expected Outcomes**:
- Portfolio looks professional
- Responsive on all device sizes
- Animations smooth
- Published site accessible
- Share link works

---

## 14.2 Journey: Startup CEO — SaaS Landing Page (P0)

**Persona**: A CEO who needs a landing page for their SaaS product launch.

### Steps:
1. **Plan first** → Type "Build a SaaS landing page for a project management tool called TaskFlow" → Click "Plan first"
2. **Review plan** → AI produces architecture with: hero, features, pricing, testimonials, footer, CTA sections
3. **Approve plan** → Click approve or type "Build it"
4. **Watch build** → AI generates complete landing page
5. **Chat**: "Add a pricing table with Free, Pro ($19/mo), and Enterprise ($49/mo) tiers"
6. **Chat**: "Add an animated statistics section showing '10K+ users', '50K+ tasks completed', '99.9% uptime'"
7. **Chat**: "Add a header with logo, nav links (Features, Pricing, Testimonials, Contact), and a 'Get Started' CTA button"
8. **Test responsive** → Check mobile hamburger menu
9. **Chat**: "Add a FAQ accordion section at the bottom"
10. **Change environment** → Add knowledge file: "Brand Guidelines: Primary color is #2563EB, font is Inter"
11. **Chat**: "Apply the brand guidelines from the knowledge base"
12. **Publish** → Deploy and get URL
13. **Add custom domain** → Configure `taskflow.io` (or skip if feature requires paid plan)

**Expected Outcomes**:
- Plan mode produces structured plan
- Build implements the plan fully
- Landing page conversion-optimized
- Brand guidelines applied from knowledge
- Pricing table accurate

---

## 14.3 Journey: Developer — Full-Stack App with Supabase (P0)

**Persona**: A developer building a task management app with database backend.

### Steps:
1. **Connect Supabase** → Go to integrations → connect Supabase with URL and key
2. **Build prompt**: "Build a task management app with Supabase backend. Features: create tasks with title, description, priority (low/medium/high), and due date. List tasks with filtering by priority and status. Mark tasks complete. Delete tasks."
3. **Wait for build** → AI creates table in Supabase + React frontend
4. **Test CRUD in preview**:
   - Create 3 tasks with different priorities
   - Filter by "High" priority
   - Mark a task complete
   - Edit a task's title
   - Delete a task
5. **Chat**: "Add user authentication with Supabase Auth. Show only the logged-in user's tasks."
6. **Chat**: "Add a dashboard view showing task statistics: total, completed, overdue, by priority"
7. **Test auth flow** in preview → Signup → Login → See tasks
8. **Version history** → Check that versions were saved
9. **Restore earlier version** → Verify restore works
10. **Push to GitHub** → Connect GitHub → push code
11. **Check GitHub repo** → Verify files match

**Expected Outcomes**:
- Supabase tables created correctly
- CRUD fully functional
- Auth protects routes
- Data persists in Supabase
- Version history works
- GitHub sync works

---

## 14.4 Journey: Business Owner — CRM System (P1)

**Persona**: A small business owner building a CRM to track clients.

### Steps:
1. **Template start** → Browse templates → find a Dashboard template → use it
2. **Customize**: "Transform this into a CRM system. Add pages for: Contacts (name, email, phone, company), Deals (amount, stage, expected close date), and Activities (type, date, notes, linked contact)."
3. **Chat**: "Add a dashboard showing: total contacts, open deals, total pipeline value, recent activities"
4. **Chat**: "Add a deal pipeline view with Kanban-style columns: Lead, Qualified, Proposal, Negotiation, Closed Won, Closed Lost"
5. **Connect Supabase** → Set up database
6. **Chat**: "Store all CRM data in Supabase. Create the necessary tables with proper relationships."
7. **Test data entry** → Add contacts, create deals, log activities
8. **Chat**: "Add search/filter on the contacts page by name, email, or company"
9. **Publish** → Deploy for team to use

**Expected Outcomes**:
- Template customized successfully
- CRM functionality comprehensive
- Database relationships work
- Kanban pipeline functional
- Search/filter works

---

## 14.5 Journey: Content Creator — Blog Platform (P1)

**Persona**: A blogger building a personal blog with CMS.

### Steps:
1. **Build**: "Build a modern blog platform with a clean, minimalist design. Include a homepage with latest posts, individual blog post pages with markdown rendering, an about page, and a tag/category system."
2. **Chat**: "Add a dark mode toggle that remembers user preference"
3. **Chat**: "Add a search bar that filters posts by title and content"
4. **Chat**: "Add estimated reading time to each post"
5. **Chat**: "Add a 'Share on Twitter' button to blog posts"
6. **Test content** → Navigate between pages, verify reading time, test search
7. **Star project** → Add to starred

**Expected Outcomes**:
- Blog platform looks professional
- Dark mode works with persistence
- Search filters correctly
- Reading time calculated
- Social sharing works

---

## 14.6 Journey: Team Collaboration (P1)

**Persona**: Two colleagues working on a project together.

### Steps:
1. **User A creates workspace** → "Team Alpha"
2. **User A invites User B** via email with Editor role
3. **User B accepts invite** → Sees shared workspace
4. **User A creates project** → "Shared Dashboard"
5. **Both users open same project** → Both see each other's presence
6. **User A sends AI prompt** → "Build a sales dashboard"
7. **User B observes** → Sees AI response and file changes in real-time
8. **User B edits CSS** → Changes a color
9. **User A sees B's change** → CRDT sync works
10. **Team chat** → A sends "Looking good!" → B replies "Thanks!"
11. **Both save** → Version history shows contributions from both

**Expected Outcomes**:
- Workspace sharing works
- Real-time collaboration functional
- Presence indicators accurate
- Team chat works
- CRDT sync reliable

---

## 14.7 Journey: Student — Learning React (P2)

**Persona**: A student learning React by building projects.

### Steps:
1. **Build**: "Build a simple React counter app to help me learn React"
2. **Chat**: "Explain how the state management works in this counter"
3. **Chat**: "Now add a reset button and explain the change"
4. **Chat**: "Add a history of all count values and explain how arrays work in React state"
5. **Chat**: "Refactor this into smaller components and explain component composition"
6. **Review code** → Read through files to learn
7. **Manual edit** → Try changing something manually to experiment

**Expected Outcomes**:
- AI provides educational explanations alongside code
- Code is clean and well-structured for learning
- Incremental complexity manageable

---

## 14.8 Journey: Rapid Prototyping Session (P0)

**Persona**: A product manager quickly prototyping 3 different ideas.

### Steps:
1. **Idea 1**: "Build a habit tracker with daily check-ins and streak counting" → Build
2. **Review** → Check preview → Star it
3. **Return to dashboard**
4. **Idea 2**: "Build a mood journal where I log my mood with emojis and notes" → Build
5. **Review** → Check preview → Star it
6. **Return to dashboard**
7. **Idea 3**: "Build a recipe collection app where I can save and search recipes by ingredient" → Build
8. **Review** → Check each project works independently
9. **Organize** → Create folder "Prototypes" → Move all 3 to it
10. **Share all** → Share links with stakeholders for feedback

**Expected Outcomes**:
- All 3 projects created quickly
- Each project independent (no cross-contamination)
- Dashboard shows all 3 with thumbnails
- Folder organization works
- Sharing works for all

---

## 14.9 Journey: Environment Power User (P2)

**Persona**: A developer who customizes their AI environment extensively.

### Steps:
1. **Create workspace environment** → "Production Standards"
2. **Add knowledge**: Brand guidelines, API documentation, coding standards
3. **Add skills**: SEO optimization, accessibility checks
4. **Add rules**: "Always use TypeScript", "Always add error boundaries"
5. **Set custom identity**: "You are a senior full-stack developer. Always write production-grade code with error handling, logging, and tests."
6. **Create project** → "Enterprise Dashboard"
7. **Chat**: "Build a user management dashboard"
8. **Verify**: Code follows all environment rules (TypeScript, error boundaries, production-grade quality)
9. **Create new environment** → "MVP Standards" with relaxed rules
10. **Switch project environment** → Compare AI output quality

**Expected Outcomes**:
- Environment settings clearly affect AI output
- Knowledge, skills, rules all respected
- Different environments produce different quality outputs
- Switching environments works without data loss

---

## 14.10 Journey: Rebuilding from Templates (P1)

**Persona**: A user who starts from templates and customizes heavily.

### Steps:
1. **Browse templates** → Find E-commerce template → Preview
2. **Create from template** → "My Online Store"
3. **Chat**: "Change the products to handmade jewelry items with proper prices and images"
4. **Chat**: "Add a shopping cart with add/remove/quantity update"
5. **Chat**: "Add a checkout form with shipping address and payment section"
6. **Chat**: "Add a search bar to filter products by name and category"
7. **Preview**: Test the complete shopping flow from browse → cart → checkout
8. **Publish** → Deploy the store

**Expected Outcomes**:
- Template provides solid foundation
- AI customizations build on template code (not replace it)
- Shopping cart functional
- Checkout flow works end-to-end
- Published site fully functional

---

## 14.11 Journey: Mobile-First App Builder (P1)

**Persona**: Someone building a mobile-optimized web app.

### Steps:
1. **Build**: "Build a mobile-first fitness tracker app with workout logging, exercise library, and progress charts"
2. **Switch to mobile preview** immediately → Verify mobile-first design
3. **Chat**: "Add a bottom navigation bar with tabs: Workouts, Exercises, Progress, Profile"
4. **Chat**: "Add swipe gestures to navigate between workout days"
5. **Test on tablet viewport** → Verify adaptive layout
6. **Test on desktop viewport** → Verify it scales up well

**Expected Outcomes**:
- Mobile-first by default
- Touch-friendly UI elements
- Bottom nav works
- Responsive across all breakpoints

---

## 14.12 Journey: Error Recovery & Debugging (P1)

**Persona**: A user who encounters and resolves errors.

### Steps:
1. **Build a project** → Something complex
2. **Manually break code** → Delete a crucial import
3. **Observe preview** → Error overlay appears
4. **Chat**: "Fix the error in the preview"
5. **AI fixes** → Preview recovers
6. **Manually add runtime error** → `throw new Error("test")`
7. **Use fix-error flow** → Click fix button if available
8. **Verify recovery** → App works again
9. **Check version history** → Restore to pre-broken version

**Expected Outcomes**:
- Error messages helpful (not cryptic)
- AI can fix errors effectively
- Fix-error flow works
- Version history enables recovery
- No data lost during errors
