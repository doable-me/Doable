import type { TemplateDefinition } from "../registry.js";

/**
 * Django 5 blank starter.
 *
 * Pairs with the `django` framework adapter. The agent prompt for
 * `framework_id: "django"` documents Django conventions (project-level
 * settings.py + urls.py, app-level views, ROOT_URLCONF, WSGI/ASGI
 * entrypoints, settings.DEBUG, sqlite default DB).
 *
 * Minimum viable shape: requirements.txt + manage.py + settings.py +
 * urls.py + views.py + wsgi.py + asgi.py. Enough for `python manage.py
 * runserver` to boot, render a starter page, and let the AI build
 * features on top.
 */

const REQUIREMENTS_TXT = `Django>=5.0,<6.0
gunicorn>=22.0
`;

const MANAGE_PY = `#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
`;

const SETTINGS_PY = `"""
Django settings for doable project.

Generated as a Doable starter scaffold. The supervisor runs
\`python manage.py runserver\` (dev) or \`gunicorn wsgi:application\`
(prod) against this module.
"""
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-doable-starter-change-me",
)

DEBUG = True

ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "wsgi.application"
ASGI_APPLICATION = "asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
`;

const URLS_PY = `"""URL configuration for the Doable Django starter."""
from django.urls import path

import views

urlpatterns = [
    path("", views.index, name="index"),
]
`;

const VIEWS_PY = `"""Views for the Doable Django starter."""
from django.http import HttpResponse


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


def index(request):
    """Welcome view rendered at the project root."""
    return HttpResponse(LANDING_HTML, content_type="text/html")
`;

const WSGI_PY = `"""
WSGI entrypoint for the Doable Django starter.

The runtime supervisor launches \`gunicorn wsgi:application\` for
production traffic.
"""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")

application = get_wsgi_application()
`;

const ASGI_PY = `"""
ASGI entrypoint for the Doable Django starter.

Use this when running under an ASGI server (uvicorn, daphne, hypercorn)
to enable async views and channels.
"""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")

application = get_asgi_application()
`;

const GITIGNORE = `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
.venv
venv/
env/

# Django
*.log
db.sqlite3
db.sqlite3-journal
/staticfiles/
/media/

# Misc
.DS_Store

# Local env files
.env
.env.local
.env*.local
`;

export const djangoBlankTemplate: TemplateDefinition = {
  id: "django-blank",
  name: "Django",
  description:
    "Django 5 + Python starter. Project-level settings, sqlite default DB, WSGI/ASGI entrypoints, and a single welcome view ready for the AI to build on top.",
  category: "starter",
  tags: ["django", "python", "ssr", "starter"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "django",

  codeFiles: {
    "requirements.txt": REQUIREMENTS_TXT,
    "manage.py": MANAGE_PY,
    "settings.py": SETTINGS_PY,
    "urls.py": URLS_PY,
    "views.py": VIEWS_PY,
    "wsgi.py": WSGI_PY,
    "asgi.py": ASGI_PY,
    ".gitignore": GITIGNORE,
  },
};
