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


def index(request):
    """Welcome view rendered at the project root."""
    return HttpResponse("Welcome to Django")
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
