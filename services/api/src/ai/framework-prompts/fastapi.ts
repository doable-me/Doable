import type { FrameworkPrompt } from "./index.js";

export const fastapiPrompt: FrameworkPrompt = {
  systemIntro:
    "The project is a FastAPI + Python backend API server. FastAPI is a modern, high-performance Python web framework with automatic OpenAPI docs. The dev server runs via uvicorn with `--reload` for hot-reloading. There is NO frontend framework — this is a pure API/backend project.",

  envConventions: [
    "0. **🔌 USE CONNECTED INTEGRATIONS**: If a `<connected-integrations>` block appears above, use the listed env vars. NEVER ask for API keys.",
    "",
    "0a. **ENV VAR RULES (FastAPI/Python)**:",
    "   - ALL env vars are server-only (no browser bundle).",
    "   - Access via `os.environ['X']` or `os.getenv('X', default)`.",
    "   - For typed config, use pydantic-settings: `class Settings(BaseSettings): supabase_url: str`",
    "   - No client prefix needed — everything runs server-side.",
    "",
    "1. **DATABASE PATTERNS (FastAPI)**:",
    "   - SQLAlchemy: `engine = create_engine(os.environ['DATABASE_URL'])`",
    "   - Supabase: `from supabase import create_client; supabase = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])`",
    "   - Raw psycopg2/asyncpg for PostgreSQL.",
  ].join("\n"),

  routing: [
    "2. **FASTAPI ROUTING**: Routes use Python decorators.",
    "   - Main entry: `main.py` with `app = FastAPI()`",
    "   - Routes: `@app.get('/items')`, `@app.post('/items')`, `@app.get('/items/{item_id}')`",
    "   - Request body: use Pydantic models — `async def create(item: ItemCreate):`",
    "   - Response: return dict/Pydantic model (auto-serialized to JSON)",
    "   - Router groups: `from fastapi import APIRouter; router = APIRouter(prefix='/api')`",
    "   - Dependencies: `Depends()` for DI (auth, db sessions, etc.)",
    "",
    "**Structure:**",
    "   - `main.py` — FastAPI app + uvicorn start",
    "   - `routers/` — route modules by domain",
    "   - `models/` — Pydantic schemas + SQLAlchemy models",
    "   - `dependencies/` — shared deps (auth, db)",
  ].join("\n"),

  styling:
    "6. **NO STYLING**: This is a backend-only project. No CSS, HTML, or frontend code. If the user needs a frontend, suggest a separate project.",

  fileShape: [
    "7. **PYTHON PROJECT**: Use `.py` files. Dependencies in `requirements.txt`.",
    "",
    "8. **FASTAPI PATTERNS**:",
    "   ```python",
    "   from fastapi import FastAPI",
    "   from fastapi.middleware.cors import CORSMiddleware",
    "   ",
    "   app = FastAPI()",
    "   app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])",
    "   ",
    "   @app.get('/health')",
    "   async def health():",
    "       return {'status': 'ok'}",
    "   ```",
    "",
    "9. **TYPE HINTS**: Always use Python type hints. FastAPI uses them for validation and docs.",
    "",
    "10. **ASYNC**: Prefer `async def` route handlers. Use `asyncpg` or `databases` for async DB access.",
  ].join("\n"),
};
