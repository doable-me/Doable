import type { TemplateDefinition } from "../registry.js";

/**
 * FastAPI blank starter.
 *
 * Pairs with the `fastapi` framework adapter. The agent prompt for
 * `framework_id: "fastapi"` documents FastAPI conventions (decorator
 * routing on a single FastAPI() app, async-first handlers, pydantic
 * models for request/response, uvicorn for dev/prod).
 *
 * Minimum viable shape: requirements.txt + main.py. Enough for
 * `uvicorn main:app --reload` to boot, return JSON from / and /health,
 * and let the AI build features on top.
 */

const REQUIREMENTS_TXT = `fastapi>=0.115
uvicorn[standard]>=0.30
`;

const MAIN_PY = `"""FastAPI entrypoint for the Doable starter."""
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()

LANDING_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Doable App</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --bg: #ffffff; --fg: #171717; --muted: #737373; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0a0a0a; --fg: #ededed; --muted: #a3a3a3; }
    }
    body {
      font-family: "Inter", system-ui, sans-serif;
      background: var(--bg);
      color: var(--fg);
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container { text-align: center; }
    .container > * + * { margin-top: 1.5rem; }
    .logo-wrap { display: flex; justify-content: center; }
    .logo { width: 4rem; height: 4rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); }
    h1 { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.025em; }
    .tagline { font-size: 1.125rem; color: #F97316; font-weight: 500; transition: opacity 400ms; }
    .subtitle { font-size: 0.875rem; color: var(--muted); }
    .dots { display: flex; justify-content: center; gap: 0.375rem; padding-top: 0.5rem; }
    .dot {
      width: 0.375rem; height: 0.375rem; border-radius: 50%; background: #F97316;
      animation: pulse-dot 1.4s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulse-dot {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1.2); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-wrap">
      <svg viewBox="0 0 40 40" fill="none" class="logo">
        <rect width="40" height="40" rx="10" fill="#F97316">
          <animate attributeName="rx" values="10;14;10" dur="3s" repeatCount="indefinite" />
        </rect>
        <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" style="font-size:22px;font-weight:700;font-family:system-ui">D</text>
      </svg>
    </div>
    <div>
      <h1>Doable</h1>
      <p class="tagline" id="tagline">Dream it. Build it.</p>
    </div>
    <p class="subtitle">Your project is ready &mdash; start chatting to build</p>
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
  </div>
  <script>
    const phrases = ["Dream it. Build it.", "Ideas become reality here.", "Your canvas awaits.", "Let's create something amazing.", "From zero to wow."];
    let i = 0;
    const el = document.getElementById("tagline");
    setInterval(() => { el.style.opacity = "0"; setTimeout(() => { i = (i + 1) % phrases.length; el.textContent = phrases[i]; el.style.opacity = "1"; }, 400); }, 3500);
  </script>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def root():
    """Welcome page rendered at the project root."""
    return LANDING_HTML


@app.get("/health")
def health():
    """Liveness probe used by the runtime supervisor."""
    return {"status": "ok"}
`;

const README_MD = `# FastAPI starter

Install dependencies with \`pip install -r requirements.txt\`, then run
\`uvicorn main:app --reload --host 127.0.0.1 --port 8000\`.
`;

const GITIGNORE = `# Python
__pycache__/
*.py[cod]
*$py.class
.Python
.venv
venv/
env/

# Misc
.DS_Store
*.log

# Local env files
.env
.env.local
.env*.local
`;

export const fastapiBlankTemplate: TemplateDefinition = {
  id: "fastapi-blank",
  name: "FastAPI",
  description:
    "FastAPI + Python async starter. Decorator routing, JSON-by-default responses, and a /health probe wired up for the runtime supervisor.",
  category: "starter",
  tags: ["fastapi", "python", "api", "async", "starter"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "fastapi",

  codeFiles: {
    "requirements.txt": REQUIREMENTS_TXT,
    "main.py": MAIN_PY,
    "README.md": README_MD,
    ".gitignore": GITIGNORE,
  },
};
