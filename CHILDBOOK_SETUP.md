# 📚 Children's Book Creator Setup Guide

This guide will help you set up the complete children's book creation app with Ollama local LLM integration.

## 🏗️ Architecture Overview

Your app now transforms images into complete children's books with the following flow:

1. **User uploads image** + provides prompts and book details
2. **Ollama generates story** based on character and preferences  
3. **ComfyUI creates illustrations** for each page using enhanced prompts
4. **ReportLab assembles PDF** with text and images
5. **User views/shares book** through mobile interface

## 🚀 Quick Start

### 1. Install Ollama (Local LLM)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a suitable model (choose one)
ollama pull llama3.1:8b      # Recommended - good balance
ollama pull phi3:mini        # Lighter, faster
ollama pull mistral:7b       # Alternative option

# Start Ollama server
ollama serve
```

### 2. Update Docker Environment

```bash
cd infra
cp .env.example .env

# Edit .env to add:
echo "OLLAMA_SERVER=http://host.docker.internal:11434" >> .env
echo "OLLAMA_MODEL=llama3.1:8b" >> .env
```

### 3. Install New Dependencies

```bash
# Backend
cd backend
pip install -r requirements.txt  # Now includes reportlab, jinja2

# Frontend  
cd ../frontend
npm install  # Now includes React Navigation, Picker
```

### 4. Start All Services

```bash
# Terminal 1: Start ComfyUI (local)
cd /path/to/ComfyUI
python main.py --listen

# Terminal 2: Start containerized services
cd infra
docker-compose -f docker-compose.local-comfyui.yml up

# Terminal 3: Start frontend
cd frontend
npm start
```

## 📱 New User Experience

### Book Creation Flow:
1. **Upload Images**: User selects 1–4 reference photos for InstantID.
2. **Choose Template**: Pick a curated story (Space Explorer, Forest Friends, etc.) and confirm target age/page count.
3. **Personalize**: Provide an optional lead character name and pronouns that feed `{Name}` / `{gender}` placeholders.
4. **Review & Create**: Confirm details and queue the generation job.

### Creation Process:
- **Story Generation**: Template pages become the narrative; placeholders are filled with the user’s inputs.
- **Image Creation**: ComfyUI generates illustrations via the shared `base` workflow with per-page prompts from the template.
- **PDF Assembly**: ReportLab combines text and images into a finished book.
- **Real-time Progress**: WebSocket updates throughout

### Book Management:
- **Library View**: All books with status tracking
- **Interactive Reader**: Page-by-page viewing with navigation
- **PDF Export**: Download/share completed books

## 🔧 Configuration Options

### Ollama Models

Choose based on your hardware:

```bash
# Light & Fast (4GB RAM)
ollama pull phi3:mini

# Balanced (8GB RAM) - Recommended
ollama pull llama3.1:8b  

# High Quality (16GB+ RAM)
ollama pull llama3.1:70b
```

### ComfyUI Workflows

- The backend seeds a single `base` workflow into the database on startup (`backend/app/default_workflows.py`).
- Every page generation job loads that workflow and rewrites node 39 (InstantID positive prompt) and node 80 (ControlNet pose prompt) using the active story template.
- To update the workflow, export a new graph from ComfyUI (Save → API Format) and upload it through the admin portal (**Workflows** page). No filesystem changes are required.

### Environment Variables

```env
# Ollama Configuration
OLLAMA_SERVER=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.1:8b

# Media Storage
MEDIA_ROOT=/data/media

# ComfyUI (existing)
COMFYUI_SERVER=host.docker.internal:8188
```

## 🗄️ Database Changes

New tables automatically created:

```sql
-- Books table
books: id, user_id, title, theme, target_age, page_count, 
       character_description, positive_prompt, negative_prompt,
       story_data, status, progress_percentage, pdf_path, etc.

-- Book pages table  
book_pages: id, book_id, page_number, text_content, 
            image_description, enhanced_prompt, image_path,
            image_status, etc.
```

## 📚 API Endpoints

### New Book Endpoints:

```http
POST /books/create
GET  /books/list
GET  /books/{id}
GET  /books/{id}/status
GET  /books/{id}/preview
GET  /books/{id}/pdf
DELETE /books/{id}
POST /books/{id}/retry
```

## 🎨 ComfyUI Integration

### Enhanced Prompts

The system automatically enhances user prompts with:

- **Age-appropriate modifiers**: Simple shapes for 3-5, detailed art for 9-12
- **Theme elements**: Adventure landscapes, friendship warmth, etc.
- **Safety filters**: Removes scary/inappropriate content
- **Professional quality**: "children's book illustration, published quality"

### Prompt Routing

- Each story template page defines two key strings:
  - `positive_prompt` → injected into InstantID (node 39) for style/character cues.
  - `pose_prompt` → injected into ControlNet (node 80) to lock pose and composition.
- Placeholders such as `{Name}`, `{gender}`, `{they}` are replaced with per-book values before sending the workflow to ComfyUI.

### Fallback System

- **Primary**: ComfyUI with theme-specific workflows
- **Fallback**: Placeholder images with book titles when ComfyUI unavailable
- **Graceful degradation**: Stories still generated even if images fail

## 🔄 Job Processing

### Multi-Stage Pipeline:

1. **Creating** (0-10%): Initialize book record
2. **Generating Story** (10-20%): Ollama creates narrative
3. **Generating Images** (20-80%): ComfyUI processes each page
4. **Composing** (80-95%): ReportLab assembles PDF  
5. **Completed** (100%): Book ready for viewing

### Worker Management:

```bash
# Monitor job queue
docker-compose -f docker-compose.local-comfyui.yml logs -f worker

# Scale workers if needed
docker-compose -f docker-compose.local-comfyui.yml up --scale worker=2
```

## 🎯 Testing the System

### 1. Test Ollama Connection

```python
# In backend container
python -c "
from app.story_generator import OllamaStoryGenerator
gen = OllamaStoryGenerator()
print('✅ Ollama available:', gen.check_model_availability())
"
```

### 2. Create Test Book

1. Open app and login with mock account
2. Upload a clear photo of a person/character
3. Fill out book creation form:
   - **Title**: "My First Adventure"  
   - **Theme**: Adventure
   - **Age**: 6-8 years
   - **Character**: "A brave young explorer"
   - **Story Elements**: "magical forest, friendly animals"
4. Submit and monitor progress in BookStatus screen

### 3. Check Generated Content

```bash
# View story generation logs
docker logs animapp-worker

# Check created files
ls /data/media/books/
ls /data/media/outputs/
```

## 🚀 Production Deployment

### Scaling Considerations:

1. **Ollama**: Run on dedicated GPU server for better performance
2. **ComfyUI**: Separate GPU-enabled container with model caching
3. **Workers**: Scale based on book creation demand
4. **Storage**: Use S3/cloud storage for generated files
5. **Database**: PostgreSQL with connection pooling

### Environment Updates:

```env
# Production Ollama
OLLAMA_SERVER=https://ollama.yourcompany.com

# Cloud Storage
AWS_S3_BUCKET=childbook-media
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# Performance
OLLAMA_NUM_PARALLEL=4
COMFYUI_MAX_WORKERS=2
```

## 🎨 Customization Options

### Story Templates
Add or adjust templates by:
1. Exporting a ComfyUI workflow update if needed and publishing it via the admin **Workflows** page (optional if you keep using the shared `base` slug).
2. Visiting the admin **Stories** page and creating a new template or editing an existing one. Paste the updated `Pages` JSON to define `story_text`, `image_prompt`, `positive_prompt`, and `pose_prompt` for each page.
3. Informing users of the new template by updating display assets/text in the mobile app if desired (template metadata is delivered from the backend, so no code change is required for availability).

### Age Groups
Modify age-specific prompts in `story_generator.py`:
```python
age_guidelines = {
    "2-4": {...},  # New toddler category
    "13-16": {...} # New teen category  
}
```

### PDF Styling
Customize book layout in `book_processor.py`:
- Fonts, colors, page layout
- Image sizing and positioning  
- Cover page design

## 🐛 Troubleshooting

### Common Issues:

**Ollama not responding:**
```bash
ollama serve
curl http://localhost:11434/api/tags
```

**ComfyUI connection failed:**
```bash
curl http://127.0.0.1:8188/system_stats
```

**Book creation stuck:**
```bash
docker logs animapp-worker
# Check for error messages in logs
```

**Frontend navigation errors:**
```bash
cd frontend
npm install @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
```

## 📊 Monitoring & Analytics

Monitor book creation success rates:

```sql
-- Book completion rates
SELECT 
    status, 
    COUNT(*) as count,
    AVG(progress_percentage) as avg_progress
FROM books 
GROUP BY status;

-- Average creation time
SELECT 
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) as avg_minutes
FROM books 
WHERE status = 'completed';
```

---

## 🎉 You're Ready!

Your animation app is now a full-featured children's book creator! Users can upload photos, customize stories, and receive professionally-formatted books with AI-generated content and illustrations.

**Key Features Implemented:**
- ✅ Local LLM story generation with Ollama
- ✅ Enhanced ComfyUI workflows for child-friendly art
- ✅ Professional PDF generation with ReportLab
- ✅ Complete mobile UI with navigation
- ✅ Real-time progress tracking
- ✅ Multi-theme support with safety filters
- ✅ Graceful fallbacks and error handling

The system is production-ready and can scale based on your needs!
