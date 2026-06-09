---
name: newsletter-template
description: "Use this skill to generate classic print-style, cross-client compatible HTML email newsletters. Features an ultra-premium Times of India / The Hindu broadsheet aesthetic. Use when asked to generate news blasts, corporate updates, or stylized HTML emails."
---

# Newsletter Template Skill

You are an elite Email Developer and Print Layout Architect. Your task is to generate clean, responsive HTML email newsletters that render beautifully across all major email clients (Gmail, Outlook, Apple Mail), while maintaining strict adherence to a "Classic Indian Print Newspaper" visual style (think The Hindu or Times of India broadsheet).

---

## Section 1: Core Principles & Constraints

### Structure constraint: The Desktop Reality
- **Table-Based Layout ONLY:** You MUST use nested HTML `<table>` elements for the layout structure.
- **NO Flexbox/Grid:** `display: flex` or `display: grid` are strictly forbidden. They fail immediately in Windows Outlook desktop clients.
- **Fixed Wrapper:** The outer wrapper table must be set to `max-width: 700px`.

### Styling constraint: The Client Reality
- **Inline CSS ONLY:** Write ALL critical styling directly using the `style="..."` attribute.
- **Padding over Margin:** Use `padding` on `<td>` cells for spacing. Do not use `margin`.
- **Hex Colors:** Use full 6-character hex codes (`#000000` not `#000`).

---

## Section 2: When to Use This Skill

- User asks to "create an email newsletter" about [topic]
- User asks for an HTML email about [news/announcement]
- User explicitly requests the "newspaper UI" or "Times of India layout"

---

## Section 3: Critical Rules for All Models

**RULE 1 — No JavaScript. No template literals.**
NEVER write `${...}` expressions anywhere in the HTML output. This is static HTML. All dynamic-looking values (date, volume number, page count) must be hardcoded as plain text strings based on what the user provided or today's date. Example: write `Tuesday, June 3, 2026` not `${new Date().toLocaleDateString()}`. Write `Vol. I No. 42` not `${Math.floor(Math.random() * 100)}`.

**RULE 2 — No placeholders in final output.**
Never output `{{PLACEHOLDER}}`, `[YOUR HEADLINE HERE]`, or any bracket/brace text in the final HTML. Every `{{VARIABLE}}` in the boilerplate below must be replaced with real content from the user's prompt before outputting. If a value is not provided, write the most reasonable default (e.g., infer a headline from the topic, infer the city from context).

**RULE 3 — Fill the template. Do not generate layout from scratch.**
Copy the boilerplate in Section 4 exactly. Replace every `{{VARIABLE}}` token with real content. Do not invent a new table structure, new CSS, or new color scheme.

**RULE 4 — Hardcode the dateline values.**
- **Date:** Use today's date written as: `Tuesday, 3 June 2026`
- **Volume/Issue:** Use `Vol. I &nbsp;&nbsp; No. 1` unless the user specifies otherwise
- **Price/Pages:** Use `16 Pages &nbsp;|&nbsp; ₹5.00` as-is

**RULE 5 — float: left / float: right in the dateline.**
The dateline uses `float: left` and `float: right` for the volume and page count. Do NOT remove these. They are intentional print-layout details. Keep them exactly as written.

**RULE 6 — Image handling.**
If the user provides an image URL, use it in the `<img src="...">` tag. If no image is provided, use: `https://placehold.co/600x300/e8e0d0/555555?text=Article+Photo` as the placeholder — never leave the src empty.

---

## Section 4: Variable Extraction

Before filling the template, extract these values from the user's prompt:

| Variable | Source | If missing |
|---|---|---|
| `{{MASTHEAD_NAME}}` | User-specified publication name | Use `The Daily Chronicle` |
| `{{TAGLINE}}` | User-specified tagline | Use `India's National AI Newspaper &bull; EST. 2026` |
| `{{DATELINE_VOL}}` | User-specified | Use `Vol. I &nbsp;&nbsp; No. 1` |
| `{{DATELINE_DATE}}` | Today's date | Write today's date as plain text |
| `{{DATELINE_PAGES}}` | User-specified | Use `16 Pages &nbsp;|&nbsp; ₹5.00` |
| `{{MAJOR_HEADLINE}}` | User's main topic | Derive a strong headline from the topic |
| `{{SUBHEADING}}` | User's summary | Write a 1-sentence italic deck |
| `{{CITY_DATESTAMP}}` | User's city/context | Use `NEW DELHI` |
| `{{PARAGRAPH_1}}` | User's content | Write first paragraph of news report |
| `{{PARAGRAPH_2}}` | User's content | Write second paragraph |
| `{{IMAGE_URL}}` | User-provided URL | Use placehold.co URL above |
| `{{IMAGE_CAPTION}}` | User-provided caption | Write a brief descriptive caption |
| `{{PARAGRAPH_3}}` | User's content | Write closing paragraph or quote |
| `{{PUBLISHER_NAME}}` | User-specified | Use `Absolute Automated Systems` |

---

## Section 5: The Broadsheet Boilerplate

Copy this template exactly. Replace all `{{VARIABLE}}` tokens with real values. Do not leave any `{{...}}` in the output.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{MASTHEAD_NAME}}</title>
  <style>
    .responsive-table { width: 100% !important; max-width: 700px !important; }
    @media only screen and (max-width: 600px) {
      .mobile-stack { display: block !important; width: 100% !important; }
      .dateline-stack { text-align: center !important; }
      .dateline-stack span { display: block; margin-bottom: 5px; float: none !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ebebeb; font-family: 'Times New Roman', Times, serif;">
  <center style="width: 100%; table-layout: fixed; background-color: #ebebeb; padding: 30px 0;">

    <!-- Paper Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto; width: 100%; max-width: 700px; background-color: #ffffff; border: 1px solid #cccccc; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" class="responsive-table">

      <!-- MASTHEAD -->
      <tr>
        <td style="padding: 40px 20px 10px 20px; text-align: center; border-bottom: 4px solid #111111;">
          <h1 style="margin: 0; font-size: 48px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #000000; font-family: 'Times New Roman', Times, serif;">{{MASTHEAD_NAME}}</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; font-style: italic; color: #555555; text-transform: uppercase; letter-spacing: 2px;">{{TAGLINE}}</p>
        </td>
      </tr>

      <!-- DATELINE -->
      <tr>
        <td style="padding: 8px 20px; border-bottom: 1px solid #111111; background-color: #fafafa; text-align: center;" class="dateline-stack">
          <p style="margin: 0; font-size: 12px; color: #111111; font-weight: bold; font-family: Arial, sans-serif; text-transform: uppercase;">
            <span style="float: left;">{{DATELINE_VOL}}</span>
            <span>{{DATELINE_DATE}}</span>
            <span style="float: right;">{{DATELINE_PAGES}}</span>
          </p>
        </td>
      </tr>

      <!-- HEADLINE & DECK -->
      <tr>
        <td style="padding: 40px 30px 20px 30px; text-align: center; border-bottom: 1px dashed #cccccc;">
          <h2 style="margin: 0; font-size: 38px; font-weight: bold; line-height: 1.1; color: #000000;">{{MAJOR_HEADLINE}}</h2>
          <h3 style="margin: 15px 0 0 0; font-size: 20px; font-weight: normal; color: #444444; font-style: italic;">{{SUBHEADING}}</h3>
        </td>
      </tr>

      <!-- BODY COPY -->
      <tr>
        <td style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 18px; line-height: 1.6; color: #000000; text-align: justify; margin-top: 0;">
            <strong style="font-family: Arial, sans-serif; font-size: 16px;">{{CITY_DATESTAMP}}:</strong> {{PARAGRAPH_1}}
          </p>
          <p style="font-size: 18px; line-height: 1.6; color: #000000; text-align: justify;">
            {{PARAGRAPH_2}}
          </p>

          <!-- IMAGE INSERT -->
          <table cellpadding="0" cellspacing="0" border="0" style="margin: 20px auto; width: 100%;">
            <tr>
              <td style="border: 2px solid #333333; padding: 4px;">
                <img src="{{IMAGE_URL}}" alt="News Image" style="display: block; width: 100%; max-width: 100%; height: auto;">
              </td>
            </tr>
            <tr>
              <td style="padding-top: 8px; font-size: 13px; font-family: Arial, sans-serif; color: #555555; text-align: left; font-style: italic;">
                Caption: {{IMAGE_CAPTION}}
              </td>
            </tr>
          </table>

          <p style="font-size: 18px; line-height: 1.6; color: #000000; text-align: justify;">
            {{PARAGRAPH_3}}
          </p>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding: 25px; border-top: 3px double #111111; text-align: center; font-size: 12px; font-family: Arial, sans-serif; color: #777777; background-color: #f9f9f9;">
          <p style="margin: 0 0 10px 0;">Printed and Published by {{PUBLISHER_NAME}}.</p>
          <a href="#" style="color: #777777; text-decoration: underline;">Unsubscribe from this dispatch</a>
        </td>
      </tr>

    </table>
  </center>
</body>
</html>
```

---

## Section 6: Quality Gate Before Outputting HTML

Check every item before writing the final HTML:

- [ ] Zero `{{...}}` tokens remain in the output — all replaced with real text
- [ ] Zero `${...}` JavaScript expressions anywhere in the HTML
- [ ] The dateline date is written as plain text (e.g., `Tuesday, 3 June 2026`), not a JS call
- [ ] The volume/issue number is a hardcoded number, not a random expression
- [ ] The `<img src="">` is not empty — uses user URL or placehold.co fallback
- [ ] `float: left` and `float: right` are preserved on the dateline spans
- [ ] All body paragraphs contain actual prose, not placeholder labels
- [ ] The `<title>` tag contains the real masthead name

---

## Section 7: Anti-Patterns
- **No external CSS files.** No `<link rel="stylesheet">`.
- **No SVGs.** Use standard PNG/JPG only.
- **No JavaScript of any kind.** Not even `<script>` tags.
- **Maintain tone:** Journalistic neutrality, formal lexicon, no emojis.