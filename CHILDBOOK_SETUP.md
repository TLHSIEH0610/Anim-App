# 📚 Children's Book Creator Setup Guide

This guide walks through the modern AnimApp stack where books are 100% template-driven (no external LLM or custom-story mode) and illustrations are produced by ComfyUI.

## 🏗️ Architecture Overview

1. **User submits photos + book details** in the mobile app.
2. **Story templates** (stored in PostgreSQL) are resolved with the user’s inputs to generate the narrative, prompts, and pricing.
3. **ComfyUI** renders per-page illustrations using the `base` workflow seeded in the database.
4. **ReportLab** assembles the finished PDF using the story text and generated images.
5. **Mobile app** streams progress and lets the reader browse, download, or retry books.

## 🚀 Quick Start

### 1. Start ComfyUI (required)

```bash
cd /path/to/ComfyUI
python main.py --listen
```

### 2. Configure Docker environment

Create `infra/.env` (the compose file already references it) with the values your stack needs:

```env
# Database
POSTGRES_DB=animapp
POSTGRES_USER=animapp
POSTGRES_PASSWORD=change-me
DATABASE_URL=postgresql://animapp:change-me@db:5432/animapp

# Redis
REDIS_URL=redis://redis:6379/0

# ComfyUI endpoint (use host.docker.internal for local GPU)
COMFYUI_SERVER=host.docker.internal:8188

# Media storage path inside containers
MEDIA_ROOT=/data/media

# Admin portal defaults
ADMIN_API_KEY=changeme
```

> The backend seeds workflows/templates automatically on startup, so no `.env` lives inside `backend/` anymore.

### 3. Install dependencies

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 4. Start services

```bash
# Terminal 1: ComfyUI (already running from step 1)

# Terminal 2: Containers
cd infra
docker-compose -f docker-compose.local-comfyui.yml up

# Terminal 3: Frontend
cd ../frontend
npm start
```

## 📱 User Experience

1. **Upload reference photos** (InstantID) and basic book settings.
2. **Choose a Story Template** (Space Explorer, Forest Friends, etc.).
3. **Personalise** with optional name/pronouns used to fill `{Name}`, `{they}`, `{gender}` placeholders.
4. **Submit** to queue the book job and follow live progress.
5. **Read/Share** via the in-app library, status page, and PDF download.

## 🔧 Configuration Options

### Story Templates
- Stored in `story_templates` / `story_template_pages` tables.
- Managed entirely through the admin portal (**Stories** tab).
- Versioned and can be toggled active/inactive per slug.
- Reseed defaults anytime with `backend/app/default_stories.py`.

### ComfyUI Workflow
- `backend/app/default_workflows.py` seeds the `base` workflow on startup.
- Each page injects template prompts into node 39 (InstantID positive prompt) and node 80 (ControlNet pose prompt).
- Update the workflow by exporting JSON from ComfyUI (Save → API Format) and pasting it into the admin portal (**Workflows** page).

### Environment Variables

Only a handful are required now:

```env
DATABASE_URL=postgresql://animapp:change-me@db:5432/animapp
REDIS_URL=redis://redis:6379/0
COMFYUI_SERVER=host.docker.internal:8188
MEDIA_ROOT=/data/media
EXPO_PUBLIC_API_BASE=http://localhost:8000   # when running frontend locally
```

## 🗄️ Database Schema Highlights

- `books` – book metadata, story payload JSON, progress fields, PDF paths.
- `book_pages` – per-page story text, prompts, and generated image metadata.
- `story_templates` / `story_template_pages` – admin-managed narrative + prompt definitions.

## 📚 API Endpoints (new ones)

```
POST   /books/create
GET    /books/list
GET    /books/{id}
GET    /books/{id}/status
GET    /books/{id}/pdf
DELETE /books/{id}
POST   /books/{id}/retry
```

## 🎨 ComfyUI Integration

- Template placeholders are filled before sending jobs to ComfyUI.
- Positive prompts steer InstantID, pose prompts lock ControlNet composition.
- Age-themed modifiers ensure the art style matches the target audience.
- If ComfyUI is unavailable, the backend falls back to placeholder imagery but still finishes the story/PDF.

## 🔄 Job Processing Lifecycle

1. **Creating** (0–10%): Book + template payload stored.
2. **Resolving Story Template** (10–20%): Placeholder replacement + per-page prompt prep.
3. **Generating Images** (20–80%): ComfyUI renders each page sequentially, progress updates stream to the app.
4. **Composing PDF** (80–95%): ReportLab lays out text, images, and metadata.
5. **Completed** (95–100%): PDF path saved, book available in the library.

Monitor workers with `docker-compose ... logs -f worker` and scale by running `docker-compose ... up --scale worker=2` if throughput is needed.
