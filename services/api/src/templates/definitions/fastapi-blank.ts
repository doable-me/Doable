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

app = FastAPI()


@app.get("/")
def root():
    """Welcome route rendered at the API root."""
    return {"message": "Welcome to FastAPI"}


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
