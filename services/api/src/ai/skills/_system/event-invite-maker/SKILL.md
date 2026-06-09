---
name: event-invite-maker
description: "Use this skill to generate beautiful, interactive HTML/CSS digital event invitations and RSVPs (Weddings, Webinars, Corporate Events, Parties, Corporate Announcements, Startups)."
---

# Digital Event Invitation Generator Skill

You are an Elite Digital Stationer and Event Designer. Your task is to generate luxurious, immersive, single-page digital invitations in pure HTML/CSS.

---

## Section 1: Theme Classification — Do This First, Before Anything Else

This is the most critical step. Every design decision — colors, fonts, background, ornaments, tone — flows from the theme. Do not touch any template until you have completed this classification.

### Step 1A: Read the event details

Extract from the user's prompt:
- Event name
- Event type (wedding, birthday, corporate, webinar, gala, fundraiser, product launch, startup announcement, baby shower, etc.)
- Host/organizer name
- Tone keywords in the prompt (words like "elegant", "fun", "professional", "intimate", "tech", "startup", "celebration")

### Step 1B: Classify into exactly one theme using this decision tree

Work through the conditions in order. Stop at the first match.

```
1. Does the event involve a wedding, engagement, anniversary, or formal gala?
   → THEME: LUXURY (midnight navy + gold starfield)

2. Is the event a tech conference, developer meetup, webinar, SaaS product launch,
   or startup funding announcement (Series A/B/C, Pre-Seed, Seed)?
   → THEME: TECH (dark slate + electric blue — NO starfield, use grid/code aesthetic)

3. Is the event a birthday party, graduation party, farewell, or casual celebration?
   → THEME: CELEBRATION (warm cream + rose gold, confetti dots)

4. Is the event a baby shower, gender reveal, naming ceremony, or family gathering?
   → THEME: SOFT (blush pink + sage, botanical accents)

5. Is the event a corporate retreat, awards ceremony, investor dinner, board meeting,
   or formal business event that is NOT a startup funding announcement?
   → THEME: CORPORATE (charcoal + indigo, clean geometric borders)

6. None of the above?
   → Use LUXURY as fallback, but adapt the palette to the event's mood.
```

**Critical rule:** A startup Series A / Series B / funding announcement is TECH, not LUXURY. A product launch is TECH. A corporate dinner at a luxury hotel is CORPORATE, not LUXURY. Only weddings, galas, and formal social celebrations are LUXURY.

### Step 1C: Record your classification before proceeding

Write this decision internally before generating any HTML:

```
Event: [event name]
Type: [what kind of event]
Theme selected: [LUXURY / TECH / CELEBRATION / SOFT / CORPORATE]
Reason: [one sentence why]
Font heading: [chosen heading font]
Font body: [chosen body font]
Primary color: [hex]
Accent color: [hex]
Background: [starfield / grid / confetti / botanical / geometric]
```

Only after completing Step 1C should you proceed to Section 4 (variable extraction) and the correct template in Section 5.

---

## Section 2: When to Use This Skill

- User asks for an "HTML invitation for a [event]"
- User wants to design a "Wedding RSVP page"
- User requests a "Digital flyer for my [event]"
- User asks for an invite for a funding announcement, product launch, or corporate event

---

## Section 3: Critical Rules for All Models

**RULE 1 — No placeholders in final output.**
Never output `{{EVENT_NAME}}`, `{{HOST_NAME}}`, `{{VENUE_NAME}}`, or any `{{...}}` token in the final HTML. Every variable must be replaced with real content from the user's prompt. If the user didn't provide a value, use the most reasonable default from Section 4.

**RULE 2 — Use the correct theme template from Section 5.**
Each theme has its own complete boilerplate. Use the one that matches your Step 1C classification. Do not mix elements from different theme templates.

**RULE 3 — Always import the correct Google Font for the chosen theme.**
The `@import url(...)` must match the theme. Never use system fonts alone.

**RULE 4 — The 3-column details row is mandatory in all themes.**
DATE / TIME / VENUE must always be a 3-column table with vertical dividers. Do NOT collapse to a list. Do NOT remove the borders. This structure is identical across all themes.

**RULE 5 — The RSVP button must be present in all themes.**
Always include the RSVP button. If no RSVP URL is provided, use `href="mailto:rsvp@example.com"` and add `<!-- Update RSVP link -->`.

**RULE 6 — Background element is theme-specific and mandatory.**
- LUXURY → `<canvas id="starfield">` with JavaScript animation
- TECH → CSS grid dot pattern (no canvas, no JavaScript animation)
- CELEBRATION → CSS confetti radial-gradient dots
- SOFT → CSS soft radial gradient, no pattern
- CORPORATE → CSS subtle geometric border lines only

**RULE 7 — Adapt tone, not just colors.**
The prehead text, button label, and contact text should match the event's tone:
- LUXURY: "You are formally invited to"
- TECH: "You're invited to join us for"
- CELEBRATION: "Join us to celebrate"
- SOFT: "We joyfully invite you to"
- CORPORATE: "You are cordially invited to attend"

---

## Section 4: Variable Extraction

| Variable | Source | If missing |
|---|---|---|
| `{{EVENT_NAME}}` | User's prompt | Ask — do not proceed without it |
| `{{EVENT_SUBTITLE}}` | User's event description | Derive from event name |
| `{{HOST_NAME}}` | User's prompt | Use `The Host` |
| `{{EVENT_DATE}}` | User's prompt | Ask, or use `Saturday, October 24th, 2026` |
| `{{EVENT_TIME}}` | User's prompt | Use `7:00 PM` |
| `{{EVENT_TIME_DETAIL}}` | User's prompt | Use `Cocktail Hour to Follow` or omit |
| `{{VENUE_NAME}}` | User's prompt | Use `The Grand Ballroom` |
| `{{VENUE_CITY}}` | User's prompt | Use `Mumbai, India` |
| `{{DRESS_CODE_LABEL}}` | Theme: LUXURY/CORPORATE → "Dress Code"; TECH → "Attire"; CELEBRATION/SOFT → "What to Wear" | Derive from theme |
| `{{DRESS_CODE}}` | User's prompt | LUXURY: "Black Tie Optional"; TECH: "Smart Casual"; CELEBRATION: "Casual Chic"; CORPORATE: "Business Formal" |
| `{{RSVP_LABEL}}` | Theme-appropriate | LUXURY: "RSVP Now"; TECH: "Register Now"; CELEBRATION: "I'll Be There!"; SOFT: "RSVP with Love"; CORPORATE: "Confirm Attendance" |
| `{{RSVP_LINK}}` | User's prompt | Use `mailto:rsvp@example.com` |
| `{{CONTACT_EMAIL}}` | User's prompt | Use `events@example.com` |
| `{{PREHEAD_TEXT}}` | Derived from theme (see Rule 7) | See Rule 7 above |

---

## Section 5: Theme Boilerplates

### 5A — LUXURY Theme (Weddings, Galas, Formal Social Events)

Fonts: Playfair Display + Montserrat | Colors: Midnight navy + gold | Background: Starfield canvas

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You Are Invited | {{EVENT_NAME}}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@300;400;600&display=swap');
    :root {
      --bg: #0a0e17;
      --gold: #d4af37;
      --gold-light: #f3e5ab;
      --text-main: #ffffff;
      --text-muted: #a0aec0;
      --border-gold: rgba(212, 175, 55, 0.3);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: var(--bg); color: var(--text-main); font-family: 'Montserrat', sans-serif; text-align: center; min-height: 100vh; overflow-x: hidden; }
    #starfield { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
    .invite-wrapper { position: relative; z-index: 1; padding: 40px 20px 60px; }
    .invite-container { max-width: 620px; margin: 0 auto; padding: 60px 40px; border: 1px solid var(--border-gold); position: relative; background: rgba(10, 14, 23, 0.6); backdrop-filter: blur(8px); }
    .corner { position: absolute; color: var(--gold); font-size: 22px; line-height: 1; }
    .corner.tl { top: 14px; left: 18px; } .corner.tr { top: 14px; right: 18px; }
    .corner.bl { bottom: 14px; left: 18px; } .corner.br { bottom: 14px; right: 18px; }
    .corner-line { position: absolute; background: var(--gold); opacity: 0.4; }
    .corner-line.top { top: 22px; left: 50px; right: 50px; height: 1px; }
    .corner-line.bottom { bottom: 22px; left: 50px; right: 50px; height: 1px; }
    .prehead { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: var(--gold); margin-bottom: 24px; }
    h1 { font-family: 'Playfair Display', serif; font-size: 52px; font-weight: 400; color: var(--gold-light); line-height: 1.1; margin-bottom: 16px; }
    .subtitle { font-family: 'Playfair Display', serif; font-size: 18px; font-style: italic; color: var(--text-muted); margin-bottom: 10px; }
    .host-line { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
    .host-name { font-family: 'Playfair Display', serif; font-size: 22px; color: var(--text-main); margin-bottom: 36px; }
    .divider { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 32px 0; opacity: 0.6; }
    .divider-line { flex: 1; height: 1px; background: var(--gold); max-width: 80px; }
    .divider-dot { color: var(--gold); font-size: 14px; }
    .details-table { width: 100%; border-collapse: collapse; margin: 0 0 32px 0; }
    .details-table td { width: 33.33%; padding: 16px 10px; vertical-align: top; }
    .details-table td:not(:last-child) { border-right: 1px solid var(--border-gold); }
    .detail-label { font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: var(--gold); margin-bottom: 10px; }
    .detail-value { font-size: 17px; font-weight: 300; line-height: 1.5; color: var(--text-main); }
    .dress-label { font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: var(--gold); margin-bottom: 8px; }
    .dress-value { font-family: 'Playfair Display', serif; font-size: 20px; font-style: italic; color: var(--text-muted); margin-bottom: 40px; }
    .rsvp-btn { display: inline-block; padding: 16px 48px; background: transparent; color: var(--gold); border: 1px solid var(--gold); text-decoration: none; font-family: 'Montserrat', sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; transition: background 0.35s, color 0.35s, box-shadow 0.35s; cursor: pointer; margin-bottom: 36px; }
    .rsvp-btn:hover { background: var(--gold); color: var(--bg); box-shadow: 0 0 28px rgba(212, 175, 55, 0.35); }
    .contact-line { font-size: 13px; color: var(--text-muted); line-height: 1.8; }
    .contact-line a { color: var(--gold); text-decoration: none; }
    @media (max-width: 500px) {
      .invite-container { padding: 48px 20px; } h1 { font-size: 36px; }
      .details-table td { display: block; width: 100%; border-right: none !important; border-bottom: 1px solid var(--border-gold); }
      .details-table td:last-child { border-bottom: none; }
    }
  </style>
</head>
<body>
  <canvas id="starfield"></canvas>
  <div class="invite-wrapper">
    <div class="invite-container">
      <span class="corner tl">✦</span><span class="corner tr">✦</span>
      <span class="corner bl">✦</span><span class="corner br">✦</span>
      <div class="corner-line top"></div><div class="corner-line bottom"></div>
      <div class="prehead">{{PREHEAD_TEXT}}</div>
      <h1>{{EVENT_NAME}}</h1>
      <div class="subtitle">{{EVENT_SUBTITLE}}</div>
      <div class="host-line">Hosted by</div>
      <div class="host-name">{{HOST_NAME}}</div>
      <div class="divider"><div class="divider-line"></div><div class="divider-dot">✦</div><div class="divider-line"></div></div>
      <table class="details-table"><tr>
        <td><div class="detail-label">Date</div><div class="detail-value">{{EVENT_DATE}}</div></td>
        <td><div class="detail-label">Time</div><div class="detail-value">{{EVENT_TIME}}<br><small style="font-size:13px;color:#a0aec0;">{{EVENT_TIME_DETAIL}}</small></div></td>
        <td><div class="detail-label">Venue</div><div class="detail-value">{{VENUE_NAME}}<br><small style="font-size:13px;color:#a0aec0;">{{VENUE_CITY}}</small></div></td>
      </tr></table>
      <div class="divider"><div class="divider-line"></div><div class="divider-dot">✦</div><div class="divider-line"></div></div>
      <div class="dress-label">{{DRESS_CODE_LABEL}}</div>
      <div class="dress-value">{{DRESS_CODE}}</div>
      <a href="{{RSVP_LINK}}" class="rsvp-btn">{{RSVP_LABEL}}</a>
      <div class="contact-line">For inquiries please contact<br><a href="mailto:{{CONTACT_EMAIL}}">{{CONTACT_EMAIL}}</a></div>
    </div>
  </div>
  <script>
    (function() {
      const canvas = document.getElementById('starfield');
      const ctx = canvas.getContext('2d');
      let stars = [];
      function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
      function createStars(n) {
        stars = [];
        for (let i = 0; i < n; i++) stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*1.2+0.2, alpha: Math.random()*0.6+0.1, speed: Math.random()*0.4+0.1, dir: Math.random()>0.5?1:-1 });
      }
      function draw() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        stars.forEach(s => { s.alpha+=s.speed*0.008*s.dir; if(s.alpha>=0.7||s.alpha<=0.05)s.dir*=-1; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fillStyle=`rgba(255,255,255,${s.alpha})`; ctx.fill(); });
        requestAnimationFrame(draw);
      }
      resize(); createStars(180); draw();
      window.addEventListener('resize', () => { resize(); createStars(180); });
    })();
  </script>
</body>
</html>
```

---

### 5B — TECH Theme (Startup Announcements, Product Launches, Webinars, Developer Events)

Fonts: Inter + Space Mono | Colors: Dark slate (#0f1117) + electric blue (#5e6ad2) + cyan accent (#00d4ff) | Background: CSS grid dot pattern — NO canvas, NO starfield

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{EVENT_NAME}}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Space+Mono:wght@400;700&display=swap');
    :root {
      --bg: #0f1117;
      --card-bg: #1a1d27;
      --blue: #5e6ad2;
      --cyan: #00d4ff;
      --text-main: #e2e8f0;
      --text-muted: #64748b;
      --border: rgba(94, 106, 210, 0.25);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      background-image: radial-gradient(circle, rgba(94,106,210,0.12) 1px, transparent 1px);
      background-size: 28px 28px;
      color: var(--text-main);
      font-family: 'Inter', sans-serif;
      text-align: center;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }
    .invite-container {
      max-width: 600px;
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 56px 44px;
      position: relative;
      box-shadow: 0 0 60px rgba(94, 106, 210, 0.1), 0 0 120px rgba(0, 212, 255, 0.05);
    }
    /* Top accent bar */
    .invite-container::before { content: ''; display: block; height: 3px; background: linear-gradient(90deg, var(--blue), var(--cyan)); border-radius: 3px 3px 0 0; position: absolute; top: 0; left: 0; right: 0; }
    /* Corner bracket TL */
    .corner-tl, .corner-tr { position: absolute; width: 20px; height: 20px; }
    .corner-tl { top: 16px; left: 16px; border-top: 2px solid var(--cyan); border-left: 2px solid var(--cyan); }
    .corner-tr { top: 16px; right: 16px; border-top: 2px solid var(--cyan); border-right: 2px solid var(--cyan); }
    .badge { display: inline-block; background: rgba(94,106,210,0.15); border: 1px solid var(--border); color: var(--blue); font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; padding: 6px 16px; border-radius: 20px; margin-bottom: 28px; }
    .prehead { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 16px; }
    h1 { font-family: 'Inter', sans-serif; font-size: 42px; font-weight: 700; color: var(--text-main); line-height: 1.1; margin-bottom: 14px; letter-spacing: -1px; }
    .subtitle { font-size: 16px; color: var(--text-muted); margin-bottom: 10px; font-weight: 300; line-height: 1.6; }
    .host-line { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
    .host-name { font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 600; color: var(--cyan); margin-bottom: 36px; }
    .divider { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 28px 0; }
    .divider-line { flex: 1; height: 1px; background: var(--border); max-width: 60px; }
    .divider-dot { color: var(--blue); font-size: 6px; }
    .details-table { width: 100%; border-collapse: collapse; margin: 0 0 28px 0; }
    .details-table td { width: 33.33%; padding: 16px 8px; vertical-align: top; }
    .details-table td:not(:last-child) { border-right: 1px solid var(--border); }
    .detail-label { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: var(--blue); margin-bottom: 8px; }
    .detail-value { font-size: 15px; font-weight: 400; line-height: 1.5; color: var(--text-main); }
    .dress-label { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: var(--blue); margin-bottom: 6px; }
    .dress-value { font-size: 18px; font-weight: 300; color: var(--text-muted); margin-bottom: 36px; }
    .rsvp-btn { display: inline-block; padding: 15px 44px; background: linear-gradient(135deg, var(--blue), #7c3aed); color: #ffffff; border: none; text-decoration: none; font-family: 'Inter', sans-serif; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600; border-radius: 8px; transition: opacity 0.25s, box-shadow 0.25s; cursor: pointer; margin-bottom: 32px; }
    .rsvp-btn:hover { opacity: 0.88; box-shadow: 0 0 32px rgba(94, 106, 210, 0.5); }
    .contact-line { font-size: 12px; color: var(--text-muted); line-height: 1.8; }
    .contact-line a { color: var(--cyan); text-decoration: none; }
    @media (max-width: 500px) {
      h1 { font-size: 30px; } .invite-container { padding: 40px 20px; }
      .details-table td { display: block; width: 100%; border-right: none !important; border-bottom: 1px solid var(--border); padding: 12px 0; }
      .details-table td:last-child { border-bottom: none; }
    }
  </style>
</head>
<body>
  <div class="invite-container">
    <div class="corner-tl"></div><div class="corner-tr"></div>
    <div class="badge">Exclusive &middot; By Invitation Only</div>
    <div class="prehead">{{PREHEAD_TEXT}}</div>
    <h1>{{EVENT_NAME}}</h1>
    <div class="subtitle">{{EVENT_SUBTITLE}}</div>
    <div class="host-line">Presented by</div>
    <div class="host-name">{{HOST_NAME}}</div>
    <div class="divider"><div class="divider-line"></div><div class="divider-dot">●</div><div class="divider-line"></div></div>
    <table class="details-table"><tr>
      <td><div class="detail-label">Date</div><div class="detail-value">{{EVENT_DATE}}</div></td>
      <td><div class="detail-label">Time</div><div class="detail-value">{{EVENT_TIME}}<br><small style="font-size:12px;color:#64748b;">{{EVENT_TIME_DETAIL}}</small></div></td>
      <td><div class="detail-label">Venue</div><div class="detail-value">{{VENUE_NAME}}<br><small style="font-size:12px;color:#64748b;">{{VENUE_CITY}}</small></div></td>
    </tr></table>
    <div class="divider"><div class="divider-line"></div><div class="divider-dot">●</div><div class="divider-line"></div></div>
    <div class="dress-label">{{DRESS_CODE_LABEL}}</div>
    <div class="dress-value">{{DRESS_CODE}}</div>
    <a href="{{RSVP_LINK}}" class="rsvp-btn">{{RSVP_LABEL}}</a>
    <div class="contact-line">For inquiries contact<br><a href="mailto:{{CONTACT_EMAIL}}">{{CONTACT_EMAIL}}</a></div>
  </div>
</body>
</html>
```

---

### 5C — CELEBRATION Theme (Birthdays, Graduations, Farewell Parties)

Fonts: Abril Fatface + Poppins | Colors: Warm cream (#fffbf0) + rose gold (#c9956e) | Background: Confetti radial dots

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{EVENT_NAME}}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Poppins:wght@300;400;500;600&display=swap');
    :root {
      --bg: #fffbf0;
      --card-bg: #ffffff;
      --rose: #c9956e;
      --rose-light: #f5e6dc;
      --text-main: #2d1b0e;
      --text-muted: #8c6a52;
      --border: rgba(201,149,110,0.3);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      background-image: radial-gradient(circle, rgba(201,149,110,0.18) 2px, transparent 2px), radial-gradient(circle, rgba(255,180,140,0.1) 1px, transparent 1px);
      background-size: 36px 36px, 18px 18px;
      background-position: 0 0, 9px 9px;
      font-family: 'Poppins', sans-serif;
      text-align: center;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }
    .invite-container { max-width: 580px; width: 100%; background: var(--card-bg); border: 2px solid var(--border); border-radius: 24px; padding: 56px 40px; position: relative; box-shadow: 8px 8px 0 var(--rose-light); }
    .ribbon { display: inline-block; background: var(--rose); color: #fff; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; padding: 6px 20px; border-radius: 20px; margin-bottom: 24px; font-weight: 500; }
    .prehead { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 16px; }
    h1 { font-family: 'Abril Fatface', serif; font-size: 52px; color: var(--text-main); line-height: 1.1; margin-bottom: 14px; }
    .subtitle { font-size: 16px; color: var(--text-muted); margin-bottom: 10px; font-weight: 300; }
    .host-line { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
    .host-name { font-family: 'Abril Fatface', serif; font-size: 22px; color: var(--rose); margin-bottom: 32px; }
    .divider { display: flex; align-items: center; justify-content: center; gap: 14px; margin: 28px 0; }
    .divider-line { flex: 1; height: 2px; background: var(--rose-light); max-width: 70px; border-radius: 2px; }
    .divider-dot { color: var(--rose); font-size: 18px; }
    .details-table { width: 100%; border-collapse: collapse; margin: 0 0 28px 0; }
    .details-table td { width: 33.33%; padding: 16px 8px; vertical-align: top; }
    .details-table td:not(:last-child) { border-right: 2px solid var(--rose-light); }
    .detail-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--rose); margin-bottom: 8px; font-weight: 600; }
    .detail-value { font-size: 15px; font-weight: 400; line-height: 1.5; color: var(--text-main); }
    .dress-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--rose); margin-bottom: 6px; font-weight: 600; }
    .dress-value { font-size: 18px; font-weight: 300; color: var(--text-muted); margin-bottom: 36px; }
    .rsvp-btn { display: inline-block; padding: 16px 48px; background: var(--rose); color: #fff; border: none; text-decoration: none; font-family: 'Poppins', sans-serif; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600; border-radius: 50px; transition: background 0.3s, box-shadow 0.3s; cursor: pointer; margin-bottom: 32px; }
    .rsvp-btn:hover { background: #b07d58; box-shadow: 0 6px 20px rgba(201,149,110,0.4); }
    .contact-line { font-size: 13px; color: var(--text-muted); line-height: 1.8; }
    .contact-line a { color: var(--rose); text-decoration: none; }
    @media (max-width: 500px) {
      h1 { font-size: 36px; } .invite-container { padding: 40px 20px; }
      .details-table td { display: block; width: 100%; border-right: none !important; border-bottom: 2px solid var(--rose-light); padding: 12px 0; }
      .details-table td:last-child { border-bottom: none; }
    }
  </style>
</head>
<body>
  <div class="invite-container">
    <div class="ribbon">🎉 Celebration</div>
    <div class="prehead">{{PREHEAD_TEXT}}</div>
    <h1>{{EVENT_NAME}}</h1>
    <div class="subtitle">{{EVENT_SUBTITLE}}</div>
    <div class="host-line">Hosted by</div>
    <div class="host-name">{{HOST_NAME}}</div>
    <div class="divider"><div class="divider-line"></div><div class="divider-dot">✿</div><div class="divider-line"></div></div>
    <table class="details-table"><tr>
      <td><div class="detail-label">Date</div><div class="detail-value">{{EVENT_DATE}}</div></td>
      <td><div class="detail-label">Time</div><div class="detail-value">{{EVENT_TIME}}<br><small style="font-size:12px;color:#8c6a52;">{{EVENT_TIME_DETAIL}}</small></div></td>
      <td><div class="detail-label">Venue</div><div class="detail-value">{{VENUE_NAME}}<br><small style="font-size:12px;color:#8c6a52;">{{VENUE_CITY}}</small></div></td>
    </tr></table>
    <div class="divider"><div class="divider-line"></div><div class="divider-dot">✿</div><div class="divider-line"></div></div>
    <div class="dress-label">{{DRESS_CODE_LABEL}}</div>
    <div class="dress-value">{{DRESS_CODE}}</div>
    <a href="{{RSVP_LINK}}" class="rsvp-btn">{{RSVP_LABEL}}</a>
    <div class="contact-line">Questions? Reach us at<br><a href="mailto:{{CONTACT_EMAIL}}">{{CONTACT_EMAIL}}</a></div>
  </div>
</body>
</html>
```

---

### 5D — SOFT Theme (Baby Showers, Gender Reveals, Family Gatherings)

Fonts: Lora + Nunito | Colors: Blush pink (#fce7f3) + sage (#6b8f71) | Background: Soft radial gradient

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{EVENT_NAME}}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Nunito:wght@300;400;600&display=swap');
    :root {
      --bg: #fdf6f9;
      --card-bg: #ffffff;
      --sage: #6b8f71;
      --sage-light: #d4e6d6;
      --blush: #e8a0b4;
      --blush-light: #fce7f3;
      --text-main: #3d2b35;
      --text-muted: #9b7a86;
      --border: rgba(232,160,180,0.4);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(ellipse at 20% 30%, rgba(252,231,243,0.8), transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(212,230,214,0.6), transparent 50%), #fdf6f9;
      font-family: 'Nunito', sans-serif;
      text-align: center;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }
    .invite-container { max-width: 560px; width: 100%; background: var(--card-bg); border: 1px solid var(--border); border-radius: 32px; padding: 56px 40px; box-shadow: 0 8px 40px rgba(232,160,180,0.15); }
    .sprigs { font-size: 22px; margin-bottom: 20px; letter-spacing: 8px; }
    .prehead { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--blush); margin-bottom: 18px; }
    h1 { font-family: 'Lora', serif; font-size: 46px; font-weight: 400; color: var(--text-main); line-height: 1.15; margin-bottom: 14px; }
    .subtitle { font-family: 'Lora', serif; font-size: 17px; font-style: italic; color: var(--text-muted); margin-bottom: 10px; }
    .host-line { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
    .host-name { font-family: 'Lora', serif; font-size: 21px; color: var(--sage); margin-bottom: 32px; }
    .divider { display: flex; align-items: center; justify-content: center; gap: 14px; margin: 26px 0; }
    .divider-line { flex: 1; height: 1px; background: var(--border); max-width: 70px; }
    .divider-dot { color: var(--blush); font-size: 16px; }
    .details-table { width: 100%; border-collapse: collapse; margin: 0 0 28px 0; }
    .details-table td { width: 33.33%; padding: 14px 8px; vertical-align: top; }
    .details-table td:not(:last-child) { border-right: 1px solid var(--border); }
    .detail-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--sage); margin-bottom: 8px; font-weight: 600; }
    .detail-value { font-size: 15px; line-height: 1.5; color: var(--text-main); }
    .dress-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--sage); margin-bottom: 6px; font-weight: 600; }
    .dress-value { font-family: 'Lora', serif; font-size: 19px; font-style: italic; color: var(--text-muted); margin-bottom: 36px; }
    .rsvp-btn { display: inline-block; padding: 15px 44px; background: var(--blush); color: #ffffff; border: none; text-decoration: none; font-family: 'Nunito', sans-serif; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600; border-radius: 50px; transition: background 0.3s, box-shadow 0.3s; cursor: pointer; margin-bottom: 32px; }
    .rsvp-btn:hover { background: #d4809a; box-shadow: 0 6px 20px rgba(232,160,180,0.4); }
    .contact-line { font-size: 13px; color: var(--text-muted); line-height: 1.8; }
    .contact-line a { color: var(--sage); text-decoration: none; }
    @media (max-width: 500px) {
      h1 { font-size: 34px; } .invite-container { padding: 40px 18px; }
      .details-table td { display: block; width: 100%; border-right: none !important; border-bottom: 1px solid var(--border); padding: 12px 0; }
      .details-table td:last-child { border-bottom: none; }
    }
  </style>
</head>
<body>
  <div class="invite-container">
    <div class="sprigs">🌿 🌸 🌿</div>
    <div class="prehead">{{PREHEAD_TEXT}}</div>
    <h1>{{EVENT_NAME}}</h1>
    <div class="subtitle">{{EVENT_SUBTITLE}}</div>
    <div class="host-line">Hosted with love by</div>
    <div class="host-name">{{HOST_NAME}}</div>
    <div class="divider"><div class="divider-line"></div><div class="divider-dot">♡</div><div class="divider-line"></div></div>
    <table class="details-table"><tr>
      <td><div class="detail-label">Date</div><div class="detail-value">{{EVENT_DATE}}</div></td>
      <td><div class="detail-label">Time</div><div class="detail-value">{{EVENT_TIME}}<br><small style="font-size:12px;color:#9b7a86;">{{EVENT_TIME_DETAIL}}</small></div></td>
      <td><div class="detail-label">Venue</div><div class="detail-value">{{VENUE_NAME}}<br><small style="font-size:12px;color:#9b7a86;">{{VENUE_CITY}}</small></div></td>
    </tr></table>
    <div class="divider"><div class="divider-line"></div><div class="divider-dot">♡</div><div class="divider-line"></div></div>
    <div class="dress-label">{{DRESS_CODE_LABEL}}</div>
    <div class="dress-value">{{DRESS_CODE}}</div>
    <a href="{{RSVP_LINK}}" class="rsvp-btn">{{RSVP_LABEL}}</a>
    <div class="contact-line">With love and excitement,<br><a href="mailto:{{CONTACT_EMAIL}}">{{CONTACT_EMAIL}}</a></div>
  </div>
</body>
</html>
```

---

### 5E — CORPORATE Theme (Investor Dinners, Awards Ceremonies, Formal Business Events)

Fonts: Cormorant Garamond + Inter | Colors: Deep charcoal (#1c1c2e) + indigo (#4f46e5) | Background: Geometric border lines, no animation

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{EVENT_NAME}}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap');
    :root {
      --bg: #f8f8fc;
      --card-bg: #ffffff;
      --charcoal: #1c1c2e;
      --indigo: #4f46e5;
      --indigo-light: #eef2ff;
      --text-main: #1c1c2e;
      --text-muted: #6b7280;
      --border: rgba(79, 70, 229, 0.15);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: var(--bg); font-family: 'Inter', sans-serif; text-align: center; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
    .invite-container { max-width: 580px; width: 100%; background: var(--card-bg); border: 1px solid rgba(79,70,229,0.2); padding: 60px 48px; position: relative; box-shadow: 0 4px 32px rgba(79,70,229,0.08); }
    /* Geometric corner lines */
    .invite-container::before { content: ''; position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px; border: 1px solid rgba(79,70,229,0.1); pointer-events: none; }
    .top-rule { width: 48px; height: 3px; background: var(--indigo); margin: 0 auto 32px; }
    .eyebrow { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--indigo); margin-bottom: 12px; font-weight: 500; }
    .prehead { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 20px; }
    h1 { font-family: 'Cormorant Garamond', serif; font-size: 46px; font-weight: 600; color: var(--charcoal); line-height: 1.15; margin-bottom: 14px; }
    .subtitle { font-family: 'Cormorant Garamond', serif; font-size: 19px; font-style: italic; color: var(--text-muted); margin-bottom: 10px; }
    .host-line { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
    .host-name { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; color: var(--charcoal); margin-bottom: 36px; }
    .divider { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 28px 0; }
    .divider-line { flex: 1; height: 1px; background: var(--border); max-width: 80px; }
    .divider-diamond { width: 6px; height: 6px; background: var(--indigo); transform: rotate(45deg); }
    .details-table { width: 100%; border-collapse: collapse; margin: 0 0 28px 0; }
    .details-table td { width: 33.33%; padding: 18px 10px; vertical-align: top; }
    .details-table td:not(:last-child) { border-right: 1px solid var(--border); }
    .detail-label { font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: var(--indigo); margin-bottom: 8px; font-weight: 500; }
    .detail-value { font-size: 16px; line-height: 1.5; color: var(--charcoal); font-weight: 300; }
    .dress-label { font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: var(--indigo); margin-bottom: 6px; font-weight: 500; }
    .dress-value { font-family: 'Cormorant Garamond', serif; font-size: 20px; font-style: italic; color: var(--text-muted); margin-bottom: 40px; }
    .rsvp-btn { display: inline-block; padding: 14px 48px; background: var(--charcoal); color: #ffffff; border: none; text-decoration: none; font-family: 'Inter', sans-serif; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; font-weight: 500; transition: background 0.3s; cursor: pointer; margin-bottom: 32px; }
    .rsvp-btn:hover { background: var(--indigo); }
    .contact-line { font-size: 13px; color: var(--text-muted); line-height: 1.8; }
    .contact-line a { color: var(--indigo); text-decoration: none; }
    .bottom-rule { width: 48px; height: 1px; background: var(--border); margin: 28px auto 0; }
    @media (max-width: 500px) {
      h1 { font-size: 32px; } .invite-container { padding: 40px 24px; }
      .details-table td { display: block; width: 100%; border-right: none !important; border-bottom: 1px solid var(--border); padding: 14px 0; }
      .details-table td:last-child { border-bottom: none; }
    }
  </style>
</head>
<body>
  <div class="invite-container">
    <div class="top-rule"></div>
    <div class="eyebrow">Confidential &middot; By Invitation Only</div>
    <div class="prehead">{{PREHEAD_TEXT}}</div>
    <h1>{{EVENT_NAME}}</h1>
    <div class="subtitle">{{EVENT_SUBTITLE}}</div>
    <div class="host-line">Presented by</div>
    <div class="host-name">{{HOST_NAME}}</div>
    <div class="divider"><div class="divider-line"></div><div class="divider-diamond"></div><div class="divider-line"></div></div>
    <table class="details-table"><tr>
      <td><div class="detail-label">Date</div><div class="detail-value">{{EVENT_DATE}}</div></td>
      <td><div class="detail-label">Time</div><div class="detail-value">{{EVENT_TIME}}<br><small style="font-size:12px;color:#6b7280;">{{EVENT_TIME_DETAIL}}</small></div></td>
      <td><div class="detail-label">Venue</div><div class="detail-value">{{VENUE_NAME}}<br><small style="font-size:12px;color:#6b7280;">{{VENUE_CITY}}</small></div></td>
    </tr></table>
    <div class="divider"><div class="divider-line"></div><div class="divider-diamond"></div><div class="divider-line"></div></div>
    <div class="dress-label">{{DRESS_CODE_LABEL}}</div>
    <div class="dress-value">{{DRESS_CODE}}</div>
    <a href="{{RSVP_LINK}}" class="rsvp-btn">{{RSVP_LABEL}}</a>
    <div class="contact-line">For enquiries, please contact<br><a href="mailto:{{CONTACT_EMAIL}}">{{CONTACT_EMAIL}}</a></div>
    <div class="bottom-rule"></div>
  </div>
</body>
</html>
```

---

## Section 6: Quality Gate Before Outputting HTML

**Phase 1 — Theme decision (must be completed first):**
- [ ] Step 1A: Event details were read and extracted
- [ ] Step 1B: Decision tree was applied — one of LUXURY / TECH / CELEBRATION / SOFT / CORPORATE was selected
- [ ] Step 1C: Classification was recorded internally before touching any template
- [ ] A startup/funding/product launch event was NOT assigned LUXURY — it was assigned TECH
- [ ] A corporate business event was NOT assigned LUXURY — it was assigned CORPORATE

**Phase 2 — Template integrity:**
- [ ] Zero `{{...}}` tokens remain — all replaced with real values
- [ ] The correct theme boilerplate from Section 5 was used — not a mix of themes
- [ ] Google Font `@import` matches the chosen theme's font pairing
- [ ] The 3-column `<table class="details-table">` is intact — not collapsed
- [ ] RSVP button `href` is set — not `#`
- [ ] `{{PREHEAD_TEXT}}` matches the theme tone from Rule 7
- [ ] `{{RSVP_LABEL}}` matches the theme tone from Rule 7
- [ ] For LUXURY: starfield `<canvas>` and `<script>` are both present
- [ ] For TECH: CSS grid dot `background-image` is present; no starfield canvas
- [ ] For CELEBRATION: confetti `background-image` radial dots are present
- [ ] For SOFT: radial-gradient background is present; no pattern
- [ ] For CORPORATE: geometric `::before` inner border is present; no animation

---

## Section 7: Anti-Patterns
- **Do not default to LUXURY for every event.** Always run the decision tree first.
- **A Series A / B / C announcement, product launch, or startup event is TECH, not LUXURY.**
- **A corporate dinner at a luxury hotel is CORPORATE, not LUXURY.**
- **Do not make it look like a corporate website.** Centered layout, elegant typography, ample negative whitespace — always.
- **Do not use default system fonts.** Always import the theme's Google Font pairing.
- **Do not collapse the 3-column details row to a list.** It is the structural centerpiece.
- **Do not use `<form>` tags.** The RSVP is always a link.
- **Do not mix CSS variables from different themes.** Each template is self-contained.