# ComfyUI Reliability Roadmap

This single playbook consolidates the full plan for measuring, stress-testing, and hardening ComfyUI on the RTX 5060 Ti eGPU stack.

---

## 1. Success Metrics & Workflow Profiling

### 1.1 Objectives
- Align on SLAs (throughput, concurrency, latency, failure budget) with product/design stakeholders.
- Capture per-workflow resource usage (VRAM, runtime) so stress tests have concrete targets.

### 1.2 SLA Definition
1. Gather business expectations: max simultaneous books, acceptable wait times, retry tolerance.
2. Translate into metrics and document in `infra/runbooks/comfyui_sla.md`:

| Metric | Definition | Suggested Starting Target |
| --- | --- | --- |
| Throughput | Completed images/minute at steady state | ≥ 20 |
| Concurrency | Max simultaneous books without SLA breach | ≥ 5 (≈ 60 pages) |
| Latency p95 | Request → rendered URL | ≤ 45 s |
| Error budget | Failed renders before fallback | ≤ 2 % |
| Recovery time | Time to refill failed slot | ≤ 2 min |

### 1.3 Profiling Procedure
1. Ensure ComfyUI runs on the production-class machine (RTX 5060 Ti eGPU). Tools needed: `nvidia-smi`, `dcgmi`, access to ComfyUI HTTP API.
2. Store representative payloads under `infra/comfyui/samples/`:
   - `book_small.json`
   - `book_medium.json`
   - `book_large.json`
3. Run the helper script (sample below) to send each payload and log GPU snapshots:

```python
import time, json, requests, subprocess

COMFY_HOST = "http://localhost:8188"
payload = json.load(open("infra/comfyui/samples/book_medium.json"))

def gpu_snapshot():
    out = subprocess.check_output(
        ["nvidia-smi", "--query-gpu=timestamp,utilization.gpu,memory.used", "--format=csv,noheader,nounits"]
    ).decode().strip()
    ts, util, mem = out.split(", ")
    return {"ts": ts, "gpu_util": int(util), "gpu_mem_mb": int(mem)}

start = time.time()
snapshots = [gpu_snapshot()]
resp = requests.post(f"{COMFY_HOST}/prompt", json=payload, timeout=300)
resp.raise_for_status()
while not resp.json().get("completed"):
    time.sleep(2)
    snapshots.append(gpu_snapshot())
duration = time.time() - start
print({"duration_sec": duration, "gpu_trace": snapshots})
```

4. Save raw metrics under `infra/comfyui/profiling/YYYY-MM-DD/` and summarize peak VRAM, runtime, and bottleneck nodes.
5. Reconcile findings with SLA expectations, adjusting either workflows or business targets as needed.

---

## 2. Load Baseline Execution

Use the lightweight harness in `infra/comfyui/load_test/` to replay exported workflows and capture concurrency metrics.

### 2.1 Export Real Workflow
1. In ComfyUI, load the production graph.
2. Choose **Save → Save (API Format)** and store the JSON at `infra/comfyui/samples/book_medium.json`. If the workflow is proprietary, keep it local and supply the alternative path via `--workflow`.

### 2.2 Running the Harness

**Windows PowerShell**
```powershell
cd infra\comfyui\load_test
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python run_load_test.py `
  --server http://127.0.0.1:8188 `
  --workflow ..\samples\book_medium.json `
  --jobs 12 `
  --concurrency 4 `
  --timeout 420 `
  --output ..\..\observability\load_2024-06-xx.json
```

**WSL / Linux shell**
```bash
cd infra/comfyui/load_test
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python run_load_test.py \
  --server http://<windows-ip>:8188 \
  --workflow ../samples/book_medium.json \
  --jobs 12 \
  --concurrency 4 \
  --timeout 420 \
  --output ../../observability/load_2024-06-xx.json
```

Tips:
- Start with low concurrency to validate correctness, then increase until GPU utilization approaches 90 % or errors rise.
- Repeat for each payload size.

### 2.3 Metric Collection & Baseline Report
1. Tail instrumentation while tests run:
   ```bash
   tail -f infra/observability/comfyui_metrics.ndjson
   ```
2. Archive the NDJSON log and harness output under `infra/observability/baselines/<date>/`.
3. Summarize:
   ```bash
   jq '.summary' infra/observability/baselines/<date>/load*.json
   ```
4. Document hardware, driver version, workflow hash, harness parameters, and observed metrics in `infra/observability/baselines/<date>/README.md`.

### 2.4 Acceptance Criteria
- Success rate ≥ SLA target (e.g., 98 %).
- p95 latency ≤ stakeholder goal (e.g., 45 s).
- Instrumentation log free of unexpected error spikes.
- Note when throughput flattens to inform retry/backoff settings.

---

## 3. Retry, Resume & UX Enhancements

### 3.1 Data Model Updates
Add columns via migration:
- `book_pages.retry_count` (int, default 0)
- `book_pages.last_attempted_at` (timestamptz)
- `book_pages.needs_regeneration` (bool, default false)
- `book_pages.job_metadata` (JSONB) for prompt overrides, ComfyUI prompt IDs, etc.

### 3.2 Backend Logic
1. Wrap `process_image_to_animation` calls with configurable retries (`COMFY_MAX_RETRIES`, default 3) and exponential backoff (`COMFY_RETRY_BACKOFF_SEC`, e.g., `15,45,90`).
2. Persist structured error info in `BookPage.image_error` (JSON array) and increment `retry_count`.
3. Expose endpoints:
   - `POST /books/{book_id}/regenerate` (user): regenerate failed pages.
   - `POST /admin/books/{book_id}/regenerate-page/{page}` (admin): targeted reruns.
4. Fan out page generation through the job queue so retries can run independently.
5. Emit observability events (`book.page.failed`, `book.page.retry`) to hook alerts later.

### 3.3 Frontend / Admin UX
- Show per-page status badges (`Pending`, `Rendering`, `Needs attention`, `Done`) in `BookStatusScreen`.
- Provide “Regenerate page” and “Retry all failed pages” actions, surfacing the latest `image_error`.
- Mirror the status view in the admin portal for support/debug.

### 3.4 Configuration
Add to `backend/.env.example`:
- `COMFY_MAX_RETRIES`
- `COMFY_RETRY_BACKOFF_SEC`
- `COMFY_ALLOW_PARALLEL_PAGES`

Roll out with conservative defaults, monitor metrics, then tune.

---

## 4. Fault Injection & Containerization

### 4.1 Fault Scenarios
Use the load harness (extend with `--scenario` flags) or a dedicated script to simulate:

| Scenario | Trigger | Expected Behavior |
| --- | --- | --- |
| Prompt validation failure | Empty/malformed prompt | Retry once, then flag `needs_regeneration` |
| GPU OOM | Duplicate heavy nodes or lower power limit via `nvidia-smi -pl` | Retry after clearing VRAM; logs show extended wait time |
| Network blip | `tc qdisc add dev eth0 root netem loss 10%` | HTTP polling retries; completion eventually succeeds |
| ComfyUI crash | Kill the process mid-run | Worker times out, requeues page, emits alert |
| Artificial latency | Insert `Sleep` node | p95 latency increases; ensures SLA boundaries are realistic |

Cadence: run full suite before major releases or driver updates; include quick prompt/network checks in weekly regression CI.

### 4.2 Container Evaluation on RTX 5060 Ti eGPU
**Why containerize**
- Reproducible workflows, simplified dependency management, and compatibility with orchestration (Docker Compose, Nomad, k8s).

**Feasibility notes**
- NVIDIA Container Toolkit can pass the eGPU into containers (`--gpus all`) as long as host drivers ≥ 535 and Docker ≥ 20.10.
- Performance overhead is negligible (< 2 % GPU), provided checkpoints are mounted from the host.
- Ensure the Thunderbolt/USB4 enclosure supports IOMMU passthrough; confirm `nvidia-smi` sees the eGPU before launching Docker.

**Prototype steps**
1. Install toolkit: `sudo apt install nvidia-container-toolkit && sudo nvidia-ctk runtime configure --runtime=docker`.
2. Create `infra/comfyui/Dockerfile` (base `nvidia/cuda:12.x-runtime-ubuntu22.04`), install Python deps, copy workflows, expose ports 8188/8189.
3. Launch:
   ```bash
   docker run --gpus all \
     -p 8188:8188 \
     -v /data/comfyui/models:/opt/comfyui/models \
     animapp/comfyui:latest
   ```
4. Run the load harness against the container and compare metrics with bare metal.
5. If performance aligns, add the service to `docker-compose.yml` and wire health checks.

**Operational considerations**
- Mount large models as read-only host volumes to keep image size manageable.
- Bake custom nodes/plugins via requirements files for consistent builds.
- Front the container with Traefik/Cloudflare_Tunnel if remote access is required.

---

## 5. Next Steps Overview
1. Finish SLA alignment and profiling; update `comfyui_metrics.ndjson` instrumentation as benchmarks run.
2. Run the harness with production payloads to establish baseline throughput/latency.
3. Implement automatic retries + UI surfacing using the data model changes outlined above.
4. Execute the fault-injection scenarios to validate resilience.
5. Prototype the container build and compare metrics; plan rollout if acceptable.

Maintain results and decisions in `infra/observability/` so every change in ComfyUI capacity or robustness is traceable.***
