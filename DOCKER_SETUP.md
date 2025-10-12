# 🐳 Docker + ComfyUI Setup

This setup runs everything in Docker and connects to ComfyUI either locally or remotely (e.g., via Cloudflare proxy) for easier workflow management.

## 🚀 Quick Start

### **1. Set up environment file**
```bash
cd infra
cp .env.example .env
# Edit .env if needed (default values should work)
```

### **2. Start ComfyUI** 
```bash
# For local setup: Start your local ComfyUI in a separate terminal
cd /path/to/your/ComfyUI
python main.py --listen
# Should be available at http://127.0.0.1:8188

# For remote setup (e.g., via Cloudflare): Ensure your remote ComfyUI is accessible
# Update COMFYUI_SERVER in .env to point to your domain (e.g., https://your-domain.com)
```

### **3. (Optional) Prepare a fallback workflow file**
The backend loads workflows from PostgreSQL. If you want a filesystem fallback (used only when the database record is missing), copy your exported ComfyUI JSON here:
```bash
mkdir -p workflows
# Example fallback filename:
cp /path/from/ComfyUI/Anmi-App.json workflows/Anmi-App.json
```

### **4. Start all services with Docker**
```bash
cd infra
docker-compose -f docker-compose.local-comfyui.yml up -d
```

### **5. Check everything is running**
```bash
docker-compose -f docker-compose.local-comfyui.yml ps
```

## 📋 What runs where:

| Service | Location | URL |
|---------|----------|-----|
| 🧠 ComfyUI | **Local or Remote** | http://127.0.0.1:8188 (local) or your domain (remote) |
| 🚀 Backend API | Docker | http://localhost:8000 |
| 👷 Worker | Docker | (background) |
| 🗄️ PostgreSQL | Docker | localhost:5432 |
| 📦 Redis | Docker | localhost:6379 |

## 🔧 Key Configuration

### **.env file settings:**
```env
# For local ComfyUI, tells containers how to reach your local instance
COMFYUI_SERVER=host.docker.internal:8188
# For remote ComfyUI (e.g., via Cloudflare), use your domain
# COMFYUI_SERVER=https://your-domain.com

# Database runs in container
DATABASE_URL=postgresql://animapp:password@db:5432/animapp

# Redis runs in container  
REDIS_URL=redis://redis:6379/0

# Optional fallback if database workflow lookup fails
COMFYUI_WORKFLOW=/app/workflows/Anmi-App.json
```

### **Network magic:**
- `host.docker.internal:8188` - Containers can reach your local ComfyUI
- `extra_hosts` configuration allows Docker containers to access your host machine

## 🏃‍♂️ Development Workflow

### **Start everything:**
```bash
# Terminal 1: ComfyUI (local)
cd /path/to/ComfyUI  
python main.py --listen

# Terminal 2: Docker services
cd infra
docker-compose -f docker-compose.local-comfyui.yml up
```

### **View logs:**
```bash
# All services
docker-compose -f docker-compose.local-comfyui.yml logs -f

# Just backend
docker-compose -f docker-compose.local-comfyui.yml logs -f backend

# Just worker  
docker-compose -f docker-compose.local-comfyui.yml logs -f worker
```

### **Stop everything:**
```bash
# Stop Docker services
docker-compose -f docker-compose.local-comfyui.yml down

# Stop ComfyUI manually (Ctrl+C)
```

## 🧪 Testing the Integration

### **1. Test upload via frontend**
- Use mock login (green button)
- Upload an image
- Check logs: `docker-compose logs -f worker`

### **2. Test ComfyUI connection**
```bash
# From inside backend container
docker exec -it animapp-backend python -c "
import requests
print(requests.get('http://host.docker.internal:8188').status_code)
"
# Should print: 200
```

### **3. Check job processing**
```bash
# View worker logs
docker-compose -f docker-compose.local-comfyui.yml logs -f worker
```

## 🎯 Benefits of this approach:

✅ **Easy ComfyUI management** - Use your existing setup  
✅ **Fast iteration** - Change workflows without rebuilding containers  
✅ **Cross-platform** - Works on macOS, Windows, Linux  
✅ **Isolated services** - Database, Redis in containers  
✅ **No conflicts** - Each service in its own container  
✅ **Production ready** - Same setup works everywhere  

## 🚚 Moving to Production

When ready for production, you can:

1. **Keep this setup** - Run ComfyUI on the same machine
2. **Containerize ComfyUI** - Add it to docker-compose later
3. **Separate machines** - Update `COMFYUI_SERVER` to remote IP

The beauty is your backend code doesn't change! 🎉
