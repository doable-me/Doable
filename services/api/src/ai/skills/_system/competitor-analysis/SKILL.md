---
name: competitor-analysis
description: "Automated workflow for extracting and analyzing competitor data using Patchright. Produces both a scraping script AND a standalone HTML intelligence dashboard."
---

# Competitor Analysis Automation

## Objective
To build reliable browser automation scripts using Patchright for scraping competitor websites, extracting key data points (pricing, features, recent blog posts), and formatting the output for strategic analysis. This skill produces TWO separate deliverables: (1) a Node.js scraping script, and (2) a standalone HTML dashboard template.

---

## Section 1: Key Principles & Execution Strategies

### Navigation & State Management
- **Headless Mode:** Run Patchright in headless mode for speed unless debugging is required.
- **Stealth & Evasion:** When accessing protected sites, use custom user agents and realistic viewports.
- **Wait Strategies:** NEVER use hardcoded `sleep` statements. Always use `waitForSelector` or `waitForLoadState('networkidle')`.

### Data Extraction Targets
- **Pricing Pages:** Tier names, monthly/annual costs, feature bullet points per tier.
- **Product/Feature Pages:** New features, messaging changes, updated value propositions.
- **Content Marketing:** Titles, publication dates, and URLs of the 5–10 most recent blog posts.

---

## Section 2: Critical Rules for All Models

**RULE 1 — Two deliverables, clearly separated.**
Always produce BOTH outputs in this exact order:
1. First: The Node.js scraping script (inside a ```javascript code block)
2. Second: The standalone HTML dashboard (inside a ```html code block)
Never merge them. Never put the HTML inside the JS template literal when showing it to the user.

**RULE 2 — The HTML dashboard is standalone.**
The HTML dashboard template shown in Section 4 is a *separate file* — `dashboard.html`. It is NOT embedded inside the JS script in your output to the user. Show it as its own clean ```html block. The JS script saves data to JSON; the dashboard reads from a hardcoded sample or is manually populated.

**RULE 3 — No placeholders in final output.**
Replace all `{{VARIABLE}}` tokens with real values from the user's prompt. If the user says "analyze Notion's pricing", the dashboard title becomes `Competitor Intelligence: Notion` and the target URL becomes `https://notion.so/pricing`. Never leave `{{...}}` visible.

**RULE 4 — Selectors must include a comment.**
Every CSS selector in the scraping script that requires customization must have an inline comment: `// CUSTOMIZE: change to match the actual site's DOM`. This tells the user exactly what needs editing.

**RULE 5 — The dashboard uses hardcoded sample data.**
Since scraping hasn't run yet, populate the HTML dashboard with 2–3 example pricing cards based on publicly known or plausible pricing for the competitor. Label them with `<!-- Sample data — replace after running scraper -->`.

---

## Section 3: Variable Extraction

| Variable | Source | If missing |
|---|---|---|
| `{{COMPETITOR_NAME}}` | User's prompt | Ask the user |
| `{{TARGET_URL}}` | User's prompt | Ask the user |
| `{{OUTPUT_FILENAME}}` | Derived from competitor name | Use `competitor-analysis.json` |
| `{{SCRAPE_DATE}}` | Today's date as plain text | Write `3 June 2026` |
| `{{PLAN_1_NAME}}` | Known/sample pricing tier | Use `Starter` |
| `{{PLAN_1_PRICE}}` | Known/sample price | Use `Free` |
| `{{PLAN_1_FEATURES}}` | Known/sample features | Use 3 plausible features |
| `{{PLAN_2_NAME}}` | Known/sample pricing tier | Use `Pro` |
| `{{PLAN_2_PRICE}}` | Known/sample price | Use `$12/mo` |
| `{{PLAN_2_FEATURES}}` | Known/sample features | Use 3 plausible features |
| `{{PLAN_3_NAME}}` | Known/sample pricing tier | Use `Enterprise` |
| `{{PLAN_3_PRICE}}` | Known/sample price | Use `Contact Sales` |
| `{{PLAN_3_FEATURES}}` | Known/sample features | Use 3 plausible features |

---

## Section 4: Deliverable 1 — The Scraping Script

Output this as a ```javascript code block. Replace `{{VARIABLE}}` tokens with real values.

```javascript
const { chromium } = require('patchright');
const fs = require('fs');

async function analyzeCompetitor(targetUrl, outputFilename) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  console.log(`Navigating to ${targetUrl}...`);

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // --- PRICING DATA EXTRACTION ---
    // CUSTOMIZE: update selectors to match the target site's actual DOM
    const pricingData = await page.evaluate(() => {
      const plans = [];
      const planElements = document.querySelectorAll('.pricing-card'); // CUSTOMIZE: match actual selector

      planElements.forEach(el => {
        plans.push({
          tier: el.querySelector('.tier-name')?.innerText.trim() || 'Unknown Tier', // CUSTOMIZE
          price: el.querySelector('.price')?.innerText.trim() || 'N/A',             // CUSTOMIZE
          features: Array.from(
            el.querySelectorAll('.feature-list li')                                  // CUSTOMIZE
          ).map(li => li.innerText.trim()).filter(Boolean)
        });
      });

      return plans;
    });

    // --- BLOG / CONTENT DATA EXTRACTION ---
    // CUSTOMIZE: update selectors to match the blog listing page
    const blogData = await page.evaluate(() => {
      const posts = [];
      const postElements = document.querySelectorAll('article.post-card'); // CUSTOMIZE

      postElements.forEach((el, i) => {
        if (i >= 10) return;
        posts.push({
          title: el.querySelector('h2, h3')?.innerText.trim() || 'Untitled',  // CUSTOMIZE
          date: el.querySelector('time')?.getAttribute('datetime') || '',      // CUSTOMIZE
          url: el.querySelector('a')?.href || ''                               // CUSTOMIZE
        });
      });

      return posts;
    });

    const report = {
      analyzedAt: new Date().toISOString(),
      competitor: targetUrl,
      pricing: pricingData,
      blog: blogData
    };

    if (!fs.existsSync('./outputs')) fs.mkdirSync('./outputs');
    fs.writeFileSync(`./outputs/${outputFilename}`, JSON.stringify(report, null, 2));
    console.log(`JSON report saved to ./outputs/${outputFilename}`);

  } catch (err) {
    console.error(`Scraping failed for ${targetUrl}:`, err.message);
  } finally {
    await browser.close();
  }
}

// Run — update URL and filename as needed
analyzeCompetitor('{{TARGET_URL}}', '{{OUTPUT_FILENAME}}');
```

---

## Section 5: Deliverable 2 — The Standalone HTML Dashboard

Output this as a separate ```html code block after the script. This is `dashboard.html` — a standalone file.
Replace all `{{VARIABLE}}` tokens. Populate the pricing cards with sample data (labeled with an HTML comment).
Do NOT nest this inside the JavaScript template literal.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Competitor Intel: {{COMPETITOR_NAME}}</title>
  <style>
    :root {
      --bg: #0d0f12;
      --card-bg: #1a1d24;
      --text: #e2e8f0;
      --accent: #5e6ad2;
      --accent-glow: #00ffcc;
      --border: #2d3340;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 40px 20px;
      min-height: 100vh;
    }
    .dashboard { max-width: 1100px; margin: 0 auto; }

    /* Header */
    .header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 36px;
    }
    .header h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; }
    .header-meta { color: var(--accent-glow); font-family: monospace; font-size: 13px; }

    /* Section title */
    .section-title {
      font-size: 12px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 20px;
      font-weight: 600;
    }

    /* Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 48px;
    }

    /* Card */
    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      border-color: var(--accent);
      box-shadow: 0 0 24px rgba(0, 255, 204, 0.08);
    }
    .card-tier {
      font-size: 13px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 10px;
      font-weight: 600;
    }
    .card-price {
      font-size: 40px;
      font-weight: 900;
      color: var(--accent-glow);
      margin-bottom: 20px;
      line-height: 1;
    }
    .card-price span { font-size: 16px; font-weight: 400; color: var(--muted); }
    .feature-list { list-style: none; padding: 0; }
    .feature-list li {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .feature-list li:last-child { border-bottom: none; }
    .feature-list li::before { content: "→"; color: var(--accent-glow); flex-shrink: 0; }

    /* Blog section */
    .blog-item {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .blog-title { font-size: 14px; color: var(--text); font-weight: 500; }
    .blog-date { font-size: 12px; color: var(--muted); white-space: nowrap; font-family: monospace; }

    /* Footer */
    .footer {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="dashboard">

    <div class="header">
      <h1>Competitor Intelligence: {{COMPETITOR_NAME}}</h1>
      <div class="header-meta">TARGET: {{TARGET_URL}} &nbsp;|&nbsp; ANALYZED: {{SCRAPE_DATE}}</div>
    </div>

    <!-- PRICING CARDS -->
    <!-- Sample data — replace after running scraper -->
    <div class="section-title">Pricing Strategy Detected</div>
    <div class="grid">

      <div class="card">
        <div class="card-tier">{{PLAN_1_NAME}}</div>
        <div class="card-price">{{PLAN_1_PRICE}}</div>
        <ul class="feature-list">
          {{PLAN_1_FEATURES}}
        </ul>
      </div>

      <div class="card">
        <div class="card-tier">{{PLAN_2_NAME}}</div>
        <div class="card-price">{{PLAN_2_PRICE}}</div>
        <ul class="feature-list">
          {{PLAN_2_FEATURES}}
        </ul>
      </div>

      <div class="card">
        <div class="card-tier">{{PLAN_3_NAME}}</div>
        <div class="card-price">{{PLAN_3_PRICE}}</div>
        <ul class="feature-list">
          {{PLAN_3_FEATURES}}
        </ul>
      </div>

    </div>

    <!-- RECENT CONTENT -->
    <div class="section-title">Recent Content Activity</div>
    <div class="blog-item">
      <span class="blog-title">Populate this section after running the scraper and reviewing the JSON output</span>
      <span class="blog-date">—</span>
    </div>

    <div class="footer">
      Data collected via Patchright automation &nbsp;|&nbsp; Review JSON output and populate cards with live data
    </div>

  </div>
</body>
</html>
```

### Feature List HTML Pattern

When populating `{{PLAN_X_FEATURES}}`, use this pattern — one `<li>` per feature:

```html
<li>Up to 5 team members</li>
<li>10 GB storage</li>
<li>Basic analytics</li>
```

---

## Section 6: Quality Gate Before Outputting

- [ ] Two separate code blocks produced: one ```javascript, one ```html
- [ ] Zero `{{...}}` tokens remain in either output
- [ ] The HTML dashboard is NOT inside the JS script's template literal
- [ ] Every scraping selector has a `// CUSTOMIZE:` comment
- [ ] Pricing cards show real or plausible sample data for the named competitor
- [ ] `<!-- Sample data — replace after running scraper -->` comment is present in the HTML
- [ ] `try/catch` block is present in the scraping script
- [ ] No hardcoded `sleep()` calls in the script

---

## Section 7: Anti-Patterns
- Do NOT use fragile nested CSS selectors. Prefer IDs, data attributes, or semantic tags.
- Do NOT spam requests. The script is for targeted analysis, not bulk crawling.
- Do NOT fail silently. Every async operation must be in a try/catch.
- Do NOT embed the HTML dashboard inside the JS script in your output. They are separate deliverables.