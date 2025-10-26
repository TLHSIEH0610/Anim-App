# AnimApp Cross-Platform Setup Guide

This guide helps you run AnimApp on both **macOS** (development) and **Windows PC** (production).

## 🖥️ Platform-Specific Paths

### **macOS (Development)**
- **Media Storage**: `~/Documents/AnimApp/media/`
- **Optional fallback workflow**: `~/Documents/AnimApp/workflows/Anmi-App.json`
- **Database**: `localhost:5432` (local PostgreSQL)
- **Redis**: `localhost:6379` (local Redis)
- **ComfyUI**: `127.0.0.1:8188` (local ComfyUI) or your configured domain (remote)

### **Windows PC (Production)**
- **Media Storage**: `C:\Users\{username}\Documents\AnimApp\media\`
- **Optional fallback workflow**: `C:\Users\{username}\Documents\AnimApp\workflows\Anmi-App.json`
- **Database**: `localhost:5432` (local PostgreSQL)
- **Redis**: `localhost:6379` (local Redis)
- **ComfyUI**: `127.0.0.1:8188` (local ComfyUI)

---

## 🚀 Quick Setup

### **Step 1: Optional helper script**
```bash
cd backend
python setup_platform.py
```
This script creates the cross-platform media/workflow directories and writes a local `.env` file for you. The repository does **not** ship with `.env` files, so either run the script or export the environment variables manually.

### **Step 2: Install Dependencies**
```bash
pip install -r requirements.txt
```

### **Step 3: Setup Services**

#### **PostgreSQL**
```bash
# macOS (using Homebrew)
brew install postgresql
brew services start postgresql
createdb animapp

# Windows (using installer)
# Download from: https://www.postgresql.org/download/windows/
# Create database: animapp
```

#### **Redis**
```bash
# macOS
brew install redis
brew services start redis

# Windows
# Download from: https://github.com/microsoftarchive/redis/releases
# Or use Docker: docker run -p 6379:6379 redis:alpine
```

#### **ComfyUI Setup**
```bash
# Clone ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Install dependencies
pip install -r requirements.txt

# Start with API enabled
python main.py --listen
```

---

## 🔧 Configuration Files

### **.env File** (create manually or via setup script)
```env
DATABASE_URL=postgresql://arnie:password@localhost:5432/appdb
REDIS_URL=redis://localhost:6379/0
COMFYUI_SERVER=127.0.0.1:8188
MEDIA_ROOT=~/Documents/AnimApp/media
# Optional fallback if DB lookup fails
COMFYUI_WORKFLOW=~/Documents/AnimApp/workflows/Anmi-App.json
```

### **ComfyUI Workflow**
1. Create or tweak your graph in ComfyUI.
2. Export via **Save → API Format**.
3. Upload the JSON in the admin portal → **Workflows** (create or update a slug such as `base`).
4. The backend stores the workflow directly in PostgreSQL. File-based fallbacks are optional; keep `COMFYUI_WORKFLOW` unset unless you truly need it.

---

## 🏃‍♂️ Running the App

### **Development (macOS)**
```bash
# Terminal 1: Start ComfyUI
cd ComfyUI
python main.py --listen

# Terminal 2: Start Backend
cd backend
uvicorn app.main:app --reload

# Terminal 3: Start Worker
cd backend
rq worker jobs books --url redis://localhost:6379/0

# Terminal 4: Start Frontend
cd frontend
npm start
```

### **Production (Windows)**
Same commands work on Windows with PowerShell or Command Prompt.

---

## 🧪 Testing the Integration

### **1. Create a Book**
- Sign in with Google (dev build) or use the admin portal to mint a user token.
- Upload reference photos, pick a template, and submit the book.
- The status screen should show `Creating` followed by progress updates.

### **2. Check Processing**
```bash
# Replace {id} with the book ID reported by the app/admin portal
curl http://localhost:8000/books/{id}/status
```

### **3. File Structure Check**
After upload, you should see:
```
~/Documents/AnimApp/media/
├── inputs/
│   └── uploaded_image.png
└── outputs/
    └── animated_uploaded_image.png
```

---

## 🔧 ComfyUI Integration Steps

### **1. Create Your Workflow**
1. Open ComfyUI web interface
2. Build image-to-animation workflow
3. Test with sample image
4. Save as API-format JSON so it can be uploaded through the admin portal

### **2. Update Workflow Integration**
The `ComfyUIClient` automatically:
- Uploads your image to ComfyUI
- Runs the workflow
- Downloads the result
- Saves to local storage

### **3. Customize for Your Workflow**
Edit `comfyui_client.py` if needed:
- Update `_prepare_workflow()` for your node structure
- Update `_download_result()` for your output format

---

## 🐛 Troubleshooting

### **ComfyUI Not Working**
- App falls back to mock processing automatically
- Check ComfyUI is running: `http://127.0.0.1:8188`
- Check workflow file exists and is valid JSON

### **Database Issues**
- Ensure PostgreSQL is running
- Check connection string in `.env`
- Create database if it doesn't exist

### **Path Issues**
- All paths use Python's `pathlib` for cross-platform compatibility
- Check directories exist: `~/Documents/AnimApp/media/`

### **Worker Issues**
```bash
# Check Redis connection
redis-cli ping

# Check RQ worker
rq worker jobs books --url redis://localhost:6379/0
```

---

## 🔄 Moving Between Platforms

### **From macOS to Windows**
1. Export your ComfyUI workflow JSON (API format) and upload it through the admin portal on the target machine.
2. Run `python setup_platform.py` on Windows
3. Update database and Redis URLs if needed
4. Install services (PostgreSQL, Redis)

### **Shared Components**
- All Python code is cross-platform
- Database schema is identical
- Frontend works on both platforms
- ComfyUI workflows are portable

---

## 📝 Summary

✅ **Cross-platform file paths** using `pathlib`  
✅ **Platform-specific defaults** for directories  
✅ **Automatic fallback** to mock processing  
✅ **Easy setup script** for both platforms  
✅ **Identical functionality** on macOS and Windows  

Your app will work seamlessly on both platforms! 🎉
