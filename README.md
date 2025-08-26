anim-app/
├─ frontend/ # React Native app
│ └─ (src, screens, services, etc.)
├─ backend/
│ ├─ app/
│ │ ├─ main.py # FastAPI entry
│ │ ├─ auth.py # JWT, hashing
│ │ ├─ db.py # SQLAlchemy session
│ │ ├─ models.py # Users, Jobs
│ │ ├─ schemas.py # Pydantic models
│ │ ├─ storage.py # save/delete files
│ │ ├─ queue.py # enqueue, ETA calc
│ │ ├─ comfy.py # ComfyUI client (GPU site)
│ │ ├─ routes/
│ │ │ ├─ auth_routes.py
│ │ │ ├─ job_routes.py
│ │ │ └─ billing_routes.py
│ ├─ worker/
│ │ └─ worker.py # RQ worker to run jobs
│ ├─ requirements.txt
│ └─ Dockerfile
├─ comfyui/ # ComfyUI repo (cloned later) + Dockerfile
├─ infra/
│ ├─ docker-compose.yml # Mac dev (no GPU)
│ ├─ docker-compose.gpu.yml # GPU overlay for mini‑PC
│ └─ .env.example
├─ scripts/
│ └─ cleanup.py # delete files > 3 days old
└─ README.md
