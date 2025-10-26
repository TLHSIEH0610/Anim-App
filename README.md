# ?? Children's Book Creator - AnimApp
- **Expo configuration** - set `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `frontend/.env` so the mobile Stripe client can initialize.

A full-stack mobile application that transforms user images into AI-generated children's books with custom stories and illustrations.

## ?? Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Services](#services)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Docker Setup](#docker-setup)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Debugging](#debugging)
- [Workflows](#workflows)
- [Troubleshooting](#troubleshooting)
- [Payment Architecture](#payment-architecture)

---

## ?? Overview

AnimApp is an AI-powered children's book creation platform that enables users to:
- Upload character images
- Generate age-appropriate stories using local LLM (Ollama)
- Create themed illustrations with ComfyUI
- Produce professional PDF books with ReportLab
- Manage and view books through a mobile interface

**Key Features:**
- ? Google OAuth authentication
- ? AI story generation (Ollama + LLaMA/Phi3/Mistral models)
- ? Theme-specific image generation (ComfyUI workflows)
- ? Real-time job processing with RQ
- ? PDF generation and preview
- ? Template-driven stories stored in the database and editable from the admin portal
- ? Cross-platform support (macOS, Windows, Linux)
- ? Docker containerization

---

## Payments & Promotions

AnimApp now includes in-app pricing logic and payment tooling so promotions and checkouts stay consistent across the stack.

- **Free trial tracking**  each `User` stores consumed free-trial slugs; templates provide an optional `free_trial_slug`, and the backend enforces single-use consumption.
- **Dynamic pricing**  story templates carry `price_dollars` plus optional `discount_price`; the shared resolver prioritises free trials, then discounts, and computes credit requirements.
- **Checkout options**  the mobile flow now submits credit redemptions, Stripe intents, or free-trial flags before queueing book generation; the backend re-validates amounts and links the resulting `Payment` record to the book.
- **Payment history**  `/billing/history` and the Billing History screen surface card/credit transactions (method, amount, status, timestamp) for end-users and support staff.

## ?? Story Templates

AnimApp ships with a single **base ComfyUI workflow** (stored in the `workflow_definitions` table) that every book uses. Variety comes from database-backed story templates that drive both the narrative and prompt engineering.

- Users pick a template such as Space Explorer, Forest Friends, Magic School Day, Pirate Adventure, or Bedtime Lullaby directly in the mobile app.
- Each template page defines `story_text`, `image_prompt`, `positive_prompt` (InstantID ? node?39) and `pose_prompt` (ControlNet ? node?80). Placeholders like `{Name}`, `{gender}`, `{they}` are filled using the name and pronouns collected in the UI.
- Admins manage templates, versions, and the base workflow at `http://localhost:8090`, so content updates no longer require code changes.
- Additional templates or workflow revisions can be introduced entirely through the admin portal, making experimentation easy without redeploying the backend.

---

## ??? Architecture

```
+-----------------+
  Mobile Client   (React Native + Expo)
   (Frontend)    
+-----------------+
          REST API
         ?
+-----------------+
   FastAPI        (Python 3.11)
   Backend       
+-----------------+
           
           +---------+
                     ?
              +--------------+
                PostgreSQL   (User data, Books, Jobs)
              +--------------+
        
        +----------+
                   ?
            +-------------+
                Redis     (Job Queue)
            +-------------+
                   
                   ?
            +-------------+
              RQ Worker   (Background Processing)
            +-------------+
                   
     +--------------+---------------+
                                  
     ?              ?               ?
+---------+  +----------+   +------------+
 Ollama     ComfyUI      ReportLab  
  LLM        Image          PDF     
 Server       Gen         Builder   
+---------+  +----------+   +------------+
```

**Processing Flow:**
1. User uploads image ? Frontend sends to Backend API
2. Backend creates Book record ? Queues job in Redis
3. RQ Worker picks up job:
   - Calls Ollama to generate story
   - Sends prompts to ComfyUI for illustrations
   - Assembles PDF with ReportLab
4. User receives real-time progress updates
5. Completed book available for viewing/download

---

## ?? Technology Stack

### Frontend
- **Framework**: React Native 0.79.6
- **UI Library**: Expo ~53.0
- **Navigation**: React Navigation 6.x
- **State Management**: React Context API
- **HTTP Client**: Axios
- **Language**: TypeScript 5.8

### Backend
- **Framework**: FastAPI (Python 3.11)
- **Web Server**: Uvicorn
- **Database ORM**: SQLAlchemy
- **Job Queue**: RQ (Redis Queue)
- **Authentication**: JWT (python-jose)
- **Password Hashing**: Passlib + Bcrypt
- **PDF Generation**: ReportLab
- **HTTP Client**: Requests
- **WebSocket**: websocket-client

### AI & Image Generation
- **LLM**: Ollama (llama3.1:8b, phi3:mini, mistral:7b)
- **Image Generation**: ComfyUI
- **Story Generation**: Custom Ollama integration

### Infrastructure
- **Database**: PostgreSQL 15
- **Cache/Queue**: Redis 7
- **Containerization**: Docker + Docker Compose
- **File Storage**: Local filesystem (media volumes)

### Development Tools
- **API Testing**: FastAPI auto-docs (Swagger/OpenAPI)
- **Linting**: (TypeScript ESLint)
- **Version Control**: Git

---

## ?? Project Structure

```
anim-app/
+-- backend/                    # FastAPI backend service
   +-- app/
      +-- main.py            # FastAPI entry point
      +-- auth.py            # JWT authentication & hashing
      +-- db.py              # SQLAlchemy database session
      +-- models.py          # Database models (User, Job, Book, BookPage)
      +-- schemas.py         # Pydantic validation schemas
      +-- storage.py         # File upload/deletion utilities
      +-- queue.py           # RQ job queue management
      +-- comfyui_client.py  # ComfyUI API client
      +-- story_generator.py # Ollama LLM story generation
      +-- default_workflows.py # Seeds the base ComfyUI workflow into the database
      +-- default_stories.py   # Seeds built-in story templates into the database
      +-- utility.py         # Helper functions
      +-- routes/
         +-- auth_routes.py # Login, register, Google OAuth
         +-- job_routes.py  # Job status endpoints
         +-- book_routes.py # Book CRUD & creation endpoints
      +-- worker/
          +-- worker_runner.py   # RQ worker initialization
          +-- job_process.py     # Simple job processing
          +-- book_processor.py  # Book creation pipeline
   +-- requirements.txt       # Python dependencies
   +-- Dockerfile             # Backend container image
   +-- setup_platform.py      # Cross-platform setup script
   +-- .env.example           # Environment variables template

+-- frontend/                  # React Native mobile app
   +-- src/
      +-- screens/
         +-- LoginScreen.tsx         # Authentication screen
         +-- BookLibraryScreen.tsx   # Book list view
         +-- BookCreationScreen.tsx  # Create new book form
         +-- BookStatusScreen.tsx    # Job progress tracker
         +-- BookViewerScreen.tsx    # Read book interface
         +-- HomeScreen.tsx          # Legacy home screen
      +-- api/
         +-- client.ts      # Axios HTTP client configuration
         +-- books.ts       # Book API calls
         +-- jobs.ts        # Job API calls
      +-- context/
          +-- AuthContext.tsx # Global auth state
   +-- assets/                # Images, fonts
   +-- App.tsx                # Root component with navigation
   +-- package.json           # NPM dependencies
   +-- tsconfig.json          # TypeScript configuration
   +-- .env                   # Frontend environment variables

+-- infra/                     # Docker infrastructure
   +-- docker-compose.local-comfyui.yml  # Docker services config
   +-- monitor.sh             # Container monitoring script
   +-- .env                   # Docker environment variables

+-- scripts/                   # Utility scripts
   +-- cleanup.py             # Delete old files (>3 days)

+-- comfyui/                   # ComfyUI installation directory

+-- CHILDBOOK_SETUP.md         # Children's book feature guide
+-- CROSS_PLATFORM_SETUP.md    # macOS/Windows setup instructions
+-- DOCKER_SETUP.md            # Docker deployment guide
+-- README.md                  # This file
```

**Code Statistics:**
- Backend Python: ~900 lines
- Frontend TypeScript: ~3,400 lines
- Total Services: 5 (Backend, Worker, Database, Redis, ComfyUI)

---

## ?? Services

### 1. **Backend API** (Port 8000)
- **Technology**: FastAPI + Uvicorn
- **Purpose**: REST API for authentication, books, jobs
- **Database**: PostgreSQL via SQLAlchemy
- **Features**: JWT auth, file uploads, job queuing

### 2. **RQ Worker**
- **Technology**: Redis Queue (RQ)
- **Purpose**: Background job processing
- **Queues**: `jobs`, `books`
- **Tasks**: Story generation, image creation, PDF assembly

### 3. **PostgreSQL Database** (Port 5432)
- **Version**: 15 Alpine
- **Purpose**: Persistent data storage
- **Tables**: users, jobs, books, book_pages

### 4. **Redis** (Port 6379)
- **Version**: 7 Alpine
- **Purpose**: Job queue, caching
- **Persistence**: AOF (Append-Only File)

### 5. **ComfyUI** (Image Generation)
- **Technology**: Python-based image generation UI
- **Purpose**: AI image generation with custom workflows
- **Connection**: HTTP API (configured via environment variable)

### 6. **Ollama** (Port 11434)
- **Technology**: Local LLM server
- **Purpose**: Story generation
- **Models**: llama3.1:8b, phi3:mini, mistral:7b
- **Connection**: HTTP API (`host.docker.internal:11434`)

### 7. **Admin Portal** (Port 8090)
- **Technology**: FastAPI + Jinja templates
- **Purpose**: Internal dashboard for administrators
- **Features**: Book overview, workflow inspection, image previews, regeneration, deletion
- **Authentication**: Default account (`tlhsieh0610@gmail.com` / `aa0910064312`), secured via `ADMIN_API_KEY`
- **Access**: `http://localhost:8090`

---

## ?? Prerequisites

### Required Software

**For Docker Setup:**
- Docker Desktop (macOS/Windows) or Docker Engine (Linux)
- Docker Compose
- ComfyUI (running locally or on GPU server)
- Ollama (running locally or on dedicated server)

**For Local Development:**
- Python 3.11+
- Node.js 18+ & npm
- PostgreSQL 15+
- Redis 7+
- ComfyUI
- Ollama
- Expo CLI

### Hardware Requirements

**Minimum:**
- CPU: 4 cores
- RAM: 8GB
- Storage: 20GB free

**Recommended for AI Generation:**
- CPU: 8+ cores
- RAM: 16GB+
- GPU: NVIDIA with 8GB+ VRAM (for ComfyUI)
- Storage: 50GB+ SSD

---

## ?? Quick Start

### Option 1: Docker Setup (Recommended)

```bash
# 1. Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.1:8b
ollama serve

# 2. Start ComfyUI locally
cd /path/to/ComfyUI
python main.py --listen

# 3. Configure environment
cd anim-app/infra
cp .env.example .env
# Edit .env with your settings

# 4. Start all services
docker-compose -f docker-compose.local-comfyui.yml up -d

# 5. Check services
docker ps
curl http://localhost:8000/health

# 6. Start frontend
cd ../frontend
npm install
npm start
```

### Option 2: Local Development

```bash
# 1. Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure .env
cp .env.example .env
# Edit .env with local PostgreSQL/Redis URLs

# Run setup script
python setup_platform.py

# Start backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. Start worker (new terminal)
cd backend
source venv/bin/activate
rq worker jobs books --url redis://localhost:6379/0

# 3. Frontend setup (new terminal)
cd frontend
npm install
npm start

# 4. Start ComfyUI (new terminal)
cd /path/to/ComfyUI
python main.py --listen

# 5. Start Ollama (new terminal)
ollama serve
```

---

## ??? Development Setup

### Backend Development

```bash
cd backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Setup platform-specific paths
python setup_platform.py

# Create database
createdb animapp

# Configure environment
cp .env.example .env
nano .env  # Edit DATABASE_URL, REDIS_URL, etc.

# Run migrations (auto-creates tables on startup)
uvicorn app.main:app --reload

# Test database connection
curl http://localhost:8000/db-check
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Configure API endpoint
echo "EXPO_PUBLIC_API_URL=http://localhost:8000" > .env

# Start Expo dev server
npm start

# Run on specific platform
npm run ios      # iOS simulator
npm run android  # Android emulator
npm run web      # Web browser
```

### Worker Development

```bash
cd backend
source venv/bin/activate

# Start worker with verbose logging
rq worker jobs books \
  --url redis://localhost:6379/0 \
  --worker-ttl 900 \
  --verbose

# Monitor queue
rq info --url redis://localhost:6379/0
```

---

## ?? Docker Setup

### Production Deployment

```bash
# 1. Configure environment
cd infra
cp .env.example .env

# Edit production values
nano .env

# 2. Build and start services
docker-compose -f docker-compose.local-comfyui.yml up -d --build

# 3. View logs
docker-compose -f docker-compose.local-comfyui.yml logs -f

# 4. Scale workers (optional)
docker-compose -f docker-compose.local-comfyui.yml up -d --scale worker=3

# 5. Monitor services
./monitor.sh
```

### Docker Commands

```bash
# Stop all services
docker-compose -f docker-compose.local-comfyui.yml down

# Restart specific service
docker-compose -f docker-compose.local-comfyui.yml restart backend

# View service logs
docker logs animapp-backend -f
docker logs animapp-worker -f

# Execute commands in container
docker exec -it animapp-backend bash

# Database access
docker exec -it animapp-db psql -U animapp -d animapp

# Redis CLI
docker exec -it animapp-redis redis-cli
```

---

## ?? Environment Configuration

### Backend `.env` (Docker)

```env
# Database
POSTGRES_DB=animapp
POSTGRES_USER=animapp
POSTGRES_PASSWORD=your-secure-password
DATABASE_URL=postgresql://animapp:your-secure-password@db:5432/animapp

# Redis
REDIS_URL=redis://redis:6379/0

# ComfyUI (local or remote via domain/proxy)
COMFYUI_SERVER=https://your-domain.com  # For remote/Cloudflare setup, or host.docker.internal:8188 for local

# Ollama
OLLAMA_SERVER=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.1:8b

# Storage
MEDIA_ROOT=/data/media

# Workflows (optional fallback if DB lookup fails)
COMFYUI_WORKFLOW=/app/workflows/Anmi-App.json

# JWT
SECRET_KEY=your-jwt-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=43200  # 30 days

# Logging
LOG_LEVEL=INFO
```

### Backend `.env` (Local Development)

```env
# Database (local PostgreSQL)
DATABASE_URL=postgresql://arnie:password@localhost:5432/appdb

# Redis (local)
REDIS_URL=redis://localhost:6379/0

# ComfyUI (local or remote via domain/proxy)
COMFYUI_SERVER=127.0.0.1:8188  # For local, or https://your-domain.com for remote/Cloudflare setup

# Ollama (local)
OLLAMA_SERVER=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Storage (platform-specific)
# macOS: ~/Documents/AnimApp/media
# Windows: C:\Users\{username}\Documents\AnimApp\media
MEDIA_ROOT=~/Documents/AnimApp/media

# Workflows (optional fallback if DB lookup fails)
COMFYUI_WORKFLOW=~/Documents/AnimApp/workflows/Anmi-App.json

# JWT
SECRET_KEY=dev-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=43200
```

### Frontend `.env`

```env
# Backend API endpoint
EXPO_PUBLIC_API_URL=http://localhost:8000

# Google OAuth (optional)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id
```

---

## ?? Running the Application

### Full Stack (Docker)

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start ComfyUI
cd /path/to/ComfyUI
python main.py --listen

# Terminal 3: Start Docker services
cd anim-app/infra
docker-compose -f docker-compose.local-comfyui.yml up

# Admin portal
# Visit http://localhost:8090 and sign in with the default admin account
# Email: tlhsieh0610@gmail.com
# Password: aa0910064312

# Terminal 4: Start frontend
cd anim-app/frontend
npm start
```

### Full Stack (Local)

```bash
# Terminal 1: Start PostgreSQL
brew services start postgresql  # macOS
# or
sudo systemctl start postgresql  # Linux

# Terminal 2: Start Redis
brew services start redis  # macOS
# or
redis-server  # Manual start

# Terminal 3: Start Ollama
ollama serve

# Terminal 4: Start ComfyUI
cd /path/to/ComfyUI
python main.py --listen

# Terminal 5: Start backend
cd anim-app/backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 6: Start worker
cd anim-app/backend
source venv/bin/activate
rq worker jobs books --url redis://localhost:6379/0

# Terminal 7: Start frontend
cd anim-app/frontend
npm start
```

### Access Points

- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs (Swagger UI)
- **ComfyUI**: http://localhost:8188 (local) or your configured domain/Cloudflare endpoint
- **Ollama**: http://localhost:11434
- **Frontend**: Expo Dev Tools (usually http://localhost:19000)
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

---

## ?? API Documentation

### Authentication Endpoints

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}

Response: {
  "access_token": "jwt-token",
  "token_type": "bearer",
  "user": { "id": 1, "email": "user@example.com", "credits": 0 }
}
```

```http
POST /auth/login
Content-Type: application/x-www-form-urlencoded

username=user@example.com&password=securepassword

Response: {
  "access_token": "jwt-token",
  "token_type": "bearer"
}
```

```http
POST /auth/google
Content-Type: application/json

{
  "id_token": "google-id-token"
}
```

```http
GET /auth/me
Authorization: Bearer {jwt-token}

Response: {
  "id": 1,
  "email": "user@example.com",
  "credits": 100,
  "created_at": "2025-01-01T00:00:00Z"
}
```

### Book Endpoints

```http
POST /books/create
Authorization: Bearer {jwt-token}
Content-Type: multipart/form-data

title=My Adventure
theme=adventure
target_age=6-8
page_count=12
character_description=A brave explorer
positive_prompt=magical forest, friendly animals
negative_prompt=scary monsters
file=@character.png

Response: {
  "book_id": 1,
  "status": "creating",
  "message": "Book creation started"
}
```

```http
GET /books/list
Authorization: Bearer {jwt-token}

Response: [
  {
    "id": 1,
    "title": "My Adventure",
    "theme": "adventure",
    "status": "completed",
    "progress_percentage": 100.0,
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

```http
GET /books/{book_id}
Authorization: Bearer {jwt-token}

Response: {
  "id": 1,
  "title": "My Adventure",
  "theme": "adventure",
  "target_age": "6-8",
  "page_count": 12,
  "status": "completed",
  "pdf_path": "/data/media/books/1/book.pdf",
  "pages": [...]
}
```

```http
GET /books/{book_id}/status
Authorization: Bearer {jwt-token}

Response: {
  "status": "generating_images",
  "progress_percentage": 45.0,
  "message": "Generating page 3 of 12"
}
```

```http
GET /books/{book_id}/pdf
Authorization: Bearer {jwt-token}

Response: PDF file download
```

```http
DELETE /books/{book_id}
Authorization: Bearer {jwt-token}

Response: {
  "message": "Book deleted successfully"
}
```

### Job Endpoints (Legacy)

```http
POST /jobs/upload
Authorization: Bearer {jwt-token}
Content-Type: multipart/form-data

file=@image.png

Response: {
  "job_id": 1,
  "status": "queued"
}
```

```http
GET /jobs/status/{job_id}
Authorization: Bearer {jwt-token}

Response: {
  "id": 1,
  "status": "processing",
  "input_path": "/data/media/inputs/image.png",
  "output_path": "/data/media/outputs/result.mp4",
  "created_at": "2025-01-01T00:00:00Z"
}
```

### Health Endpoints

```http
GET /

Response: {
  "status": "ok",
  "message": "Backend is running!"
}
```

```http
GET /health

Response: {
  "status": "healthy",
  "db": "connected"
}
```

```http
GET /db-check

Response: {
  "db_connected": true
}
```

---

## ??? Database Schema

### Users Table

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    credits INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Jobs Table (Legacy)

```sql
CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    status VARCHAR(32) DEFAULT 'queued',
    input_path TEXT NOT NULL,
    output_path TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE
);
```

### Books Table

```sql
CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    theme VARCHAR(100),
    target_age VARCHAR(10),
    page_count INTEGER DEFAULT 8,

    character_description TEXT,
    positive_prompt TEXT,
    negative_prompt TEXT,
    original_image_path TEXT,

    story_data TEXT,  -- JSON

    status VARCHAR(32) DEFAULT 'creating',
    progress_percentage FLOAT DEFAULT 0.0,
    error_message TEXT,

    pdf_path TEXT,
    preview_image_path TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    story_generated_at TIMESTAMP WITH TIME ZONE,
    images_completed_at TIMESTAMP WITH TIME ZONE,
    pdf_generated_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);
```

### Book Pages Table

```sql
CREATE TABLE book_pages (
    id SERIAL PRIMARY KEY,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,

    text_content TEXT NOT NULL,
    image_description TEXT NOT NULL,

    enhanced_prompt TEXT,
    image_path TEXT,
    comfy_job_id VARCHAR(100),

    image_status VARCHAR(32) DEFAULT 'pending',
    image_error TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    image_started_at TIMESTAMP WITH TIME ZONE,
    image_completed_at TIMESTAMP WITH TIME ZONE
);
```

---

## ?? Debugging

### Backend Debugging

```bash
# Enable debug logging
export LOG_LEVEL=DEBUG
uvicorn app.main:app --reload --log-level debug

# Interactive debugging with breakpoints
# Add to code:
import pdb; pdb.set_trace()

# Check database queries
# Add to db.py:
from sqlalchemy import event
from sqlalchemy.engine import Engine

@event.listens_for(Engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, params, context, executemany):
    print("SQL:", statement)
    print("Params:", params)
```

### Worker Debugging

```bash
# Run worker with verbose output
rq worker jobs books \
  --url redis://localhost:6379/0 \
  --verbose \
  --worker-ttl 900

# Check failed jobs
rq info --url redis://localhost:6379/0

# Inspect specific job
python -c "
from redis import Redis
from rq import Queue
from rq.job import Job

redis_conn = Redis.from_url('redis://localhost:6379/0')
job = Job.fetch('job-id', connection=redis_conn)
print('Status:', job.get_status())
print('Result:', job.result)
print('Error:', job.exc_info)
"
```

### Frontend Debugging

```bash
# Enable React DevTools
npm install -g react-devtools
react-devtools

# View network requests
# Open Expo DevTools and enable Network tab

# Debug on device
# Shake device ? "Debug Remote JS"
# Open Chrome ? http://localhost:19000/debugger-ui

# Console logging
console.log('Debug:', data);

# React Native Debugger
brew install --cask react-native-debugger  # macOS
```

### ComfyUI Debugging

```bash
# Check ComfyUI logs
tail -f /path/to/ComfyUI/comfyui.log

# Test workflow manually
# 1. Open http://localhost:8188 (for local) or your configured domain/Cloudflare endpoint
# 2. Load workflow JSON
# 3. Queue prompt
# 4. Check for errors

# API testing (local)
curl http://localhost:8188/system_stats
curl http://localhost:8188/queue
curl http://localhost:8188/history

# API testing (remote/Cloudflare)
curl -k https://your-domain.com/system_stats  # Replace with your actual domain
curl -k https://your-domain.com/queue
curl -k https://your-domain.com/history
```

### Ollama Debugging

```bash
# Check Ollama status
ollama list

# Test model
ollama run llama3.1:8b "Hello, world!"

# API testing
curl http://localhost:11434/api/tags
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1:8b",
  "prompt": "Tell me a story",
  "stream": false
}'

# View logs
journalctl -u ollama -f  # Linux systemd
# or check Ollama server output
```

### Database Debugging

```bash
# Connect to database
psql -U animapp -d animapp

# Useful queries
SELECT * FROM users;
SELECT * FROM books ORDER BY created_at DESC LIMIT 10;
SELECT * FROM book_pages WHERE book_id = 1;

# Check book status
SELECT id, title, status, progress_percentage, error_message
FROM books
WHERE user_id = 1
ORDER BY created_at DESC;

# Check page generation status
SELECT book_id, page_number, image_status, image_error
FROM book_pages
WHERE book_id = 1
ORDER BY page_number;
```

---

## ?? Workflows & Templates

### ComfyUI Workflows

- The backend seeds a single `base` workflow into the `workflow_definitions` table during startup (`backend/app/default_workflows.py`).
- RQ workers fetch the latest active record for the slug referenced by each story template (currently `base`). No JSON files need to live in the repository.
- To publish an update:
  1. Export your ComfyUI graph via **Save ? API Format**.
  2. Open the admin portal ? **Workflows** ? Edit the `base` record (or add a new slug) and paste the JSON.
  3. The next job will automatically use the new version.
- The optional `COMFYUI_WORKFLOW` environment variable remains as a fallback path should the database lookup fail.

### Story Templates

- Templates are stored in `story_templates` and `story_template_pages` (seeded by `backend/app/default_stories.py`).
- Each page captures `story_text`, `image_prompt`, `positive_prompt` (InstantID / node?39) and `pose_prompt` (ControlNet / node?80).
- Supported placeholders inside those fields: `{Name}`, `{name}`, `{gender}`, `{Gender}`, `{they}`, `{them}`, `{their}`, `{theirs}` (plus capitalised variants). Values come from the mobile creation form.
- Manage templates from the admin portal ? **Stories**. Paste updated JSON into the Pages textarea to tweak narratives and prompts without redeploying.

---

## ?? Troubleshooting

### Common Issues

#### 1. **503 upstream connect error**

**Cause**: ComfyUI or Ollama not accessible from Docker container

**Solution**:
```bash
# Check services are running
curl http://localhost:8188/system_stats  # ComfyUI (local)
curl http://localhost:11434/api/tags     # Ollama

# For remote ComfyUI (Cloudflare/proxy setup), test the domain directly
curl -k https://your-domain.com/system_stats  # ComfyUI (remote)

# Verify Docker can reach host (for local setup)
docker exec animapp-backend curl http://host.docker.internal:8188/system_stats

# Update .env if needed (for local setup)
COMFYUI_SERVER=host.docker.internal:8188
OLLAMA_SERVER=http://host.docker.internal:11434

# Or for remote/Cloudflare setup
COMFYUI_SERVER=https://your-domain.com  # Replace with your actual domain
OLLAMA_SERVER=http://host.docker.internal:11434
```

#### 2. **Database connection failed**

**Cause**: PostgreSQL not running or wrong credentials

**Solution**:
```bash
# Check PostgreSQL status
brew services list  # macOS
systemctl status postgresql  # Linux

# Test connection
psql -U animapp -d animapp

# Reset password if needed
ALTER USER animapp PASSWORD 'new-password';

# Update .env
DATABASE_URL=postgresql://animapp:new-password@db:5432/animapp
```

#### 3. **Worker not processing jobs**

**Cause**: Redis not running or worker crashed

**Solution**:
```bash
# Check Redis
redis-cli ping  # Should return "PONG"

# Check worker logs
docker logs animapp-worker -f

# Restart worker
docker-compose -f docker-compose.local-comfyui.yml restart worker

# Check queue
rq info --url redis://redis:6379/0
```

#### 4. **Ollama model not found**

**Cause**: Model not downloaded

**Solution**:
```bash
# List available models
ollama list

# Pull required model
ollama pull llama3.1:8b

# Update .env to match
OLLAMA_MODEL=llama3.1:8b
```

#### 5. **Frontend can't connect to backend**

**Cause**: Wrong API URL or CORS issue

**Solution**:
```bash
# Check backend is running
curl http://localhost:8000/health

# Update frontend .env
EXPO_PUBLIC_API_URL=http://localhost:8000

# For mobile device (not localhost)
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000  # Use computer's IP

# Restart Expo
npm start -- --clear
```

#### 6. **Book creation stuck at 0%**

**Cause**: Worker not picking up jobs, Ollama/ComfyUI issues

**Solution**:
```bash
# Check worker logs
docker logs animapp-worker -f

# Check job in database
psql -U animapp -d animapp -c "SELECT * FROM books WHERE id=1;"

# Check Redis queue
docker exec animapp-redis redis-cli LLEN rq:queue:books

# Manually retry
curl -X POST http://localhost:8000/books/1/retry \
  -H "Authorization: Bearer your-token"
```

#### 7. **ComfyUI workflow errors**

**Cause**: Invalid workflow JSON or missing nodes

**Solution**:
```bash
# Validate workflow manually in ComfyUI UI
# 1. Open http://localhost:8188
# 2. Load workflow file
# 3. Check for missing nodes (red)
# 4. Install missing custom nodes

# Check backend logs for workflow errors
docker logs animapp-backend -f | grep -i comfy
```

### Log Locations

```bash
# Docker logs
docker logs animapp-backend -f
docker logs animapp-worker -f
docker logs animapp-db -f
docker logs animapp-redis -f

# Local logs
# Backend: console output
# Worker: console output
# PostgreSQL: /usr/local/var/log/postgres.log (macOS)
# Redis: /usr/local/var/log/redis.log (macOS)
```

### Performance Optimization

```bash
# Scale workers
docker-compose -f docker-compose.local-comfyui.yml up -d --scale worker=3

# Increase Redis memory
# Edit docker-compose file:
redis:
  command: redis-server --appendonly yes --maxmemory 2gb

# Optimize PostgreSQL
# Edit postgresql.conf:
shared_buffers = 256MB
work_mem = 16MB
maintenance_work_mem = 128MB
```

---

## ?? Additional Documentation

- [CHILDBOOK_SETUP.md](./CHILDBOOK_SETUP.md) - Detailed children's book feature setup
- [CROSS_PLATFORM_SETUP.md](./CROSS_PLATFORM_SETUP.md) - macOS/Windows development guide
- [DOCKER_SETUP.md](./DOCKER_SETUP.md) - Production Docker deployment
- [frontend/GOOGLE_AUTH_SETUP.md](./frontend/GOOGLE_AUTH_SETUP.md) - Google OAuth configuration

---

## ?? License

This project is proprietary software. All rights reserved.

---

## ?? Contributing

This is a private project. For issues or feature requests, contact the development team.

---

## ?? Getting Help

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review relevant setup guides in the docs
3. Check Docker/service logs
4. Verify environment variables are correct
5. Test each service independently

**Development Team Contact**: [Your contact info]

---

**Last Updated**: January 2025
**Version**: 1.0.0
**Status**: Production Ready

## ?? Payment Architecture

For a deep dive into the end-to-end payment flow (Stripe configuration, credit redemptions, and frontend behaviour), read [PAYMENT_ARCHITECTURE.md](./PAYMENT_ARCHITECTURE.md). It captures component responsibilities, environment variables, and validation steps so new contributors can bring payments online quickly.

