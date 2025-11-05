# Use Python image for development
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (PostgreSQL client tools for backups) and Python deps
COPY requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && pip install --no-cache-dir -r requirements.txt \
    && rm -rf /var/lib/apt/lists/*

# Copy app code
COPY . .

# Run FastAPI server with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
