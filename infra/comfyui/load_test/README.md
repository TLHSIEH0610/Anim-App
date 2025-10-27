## ComfyUI Load Test Harness

This lightweight harness replays exported ComfyUI workflows against a running server so we can measure concurrency limits without touching the production backend.

### Requirements
- Python 3.10+
- `requests` + `tqdm` (`pip install -r requirements.txt` from this folder)
- A ComfyUI server reachable from the machine running the test
- Workflow JSON exported via **Save > API Format** (drop the file under `infra/comfyui/samples/`)

### Usage
```bash
cd infra/comfyui/load_test
python run_load_test.py \
  --server http://127.0.0.1:8188 \
  --workflow ../samples/book_medium.json \
  --jobs 12 \
  --concurrency 4 \
  --timeout 420 \
  --output results.json
```

Flags:
- `--server`: Base URL for ComfyUI (`http://host:port`)
- `--workflow`: Path to workflow JSON (API format, not UI save)
- `--jobs`: Total prompts to queue (default: 4)
- `--concurrency`: Number of worker threads hammering ComfyUI (default: 2)
- `--timeout`: Seconds before marking a prompt as failed (default: 300)
- `--output`: Optional path to dump per-job metrics as JSON

### What it records
- Prompt latency (queue → completion)
- Number of polls before completion/error
- Final status + error text
- Aggregate throughput and p95 latency summary

The script reuses the same HTTP endpoints as the backend (`/prompt`, `/history/{id}`) so the results map directly to real workloads.***
