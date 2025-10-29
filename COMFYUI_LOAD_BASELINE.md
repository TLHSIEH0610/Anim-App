# ComfyUI Load Test Baseline – Step 2 Checklist

Use this guide once the instrumentation is in place. The goal is to capture a reproducible baseline of ComfyUI throughput/latency on the RTX 5060 Ti eGPU.

## 1. Export Real Workflow
1. Open ComfyUI → load the production graph.
2. Click **Save** → **Save (API Format)** and store the JSON at `infra/comfyui/samples/book_medium.json` (overwrite the placeholder).
3. Commit the updated JSON only to internal/private repos if it contains proprietary nodes; otherwise keep it local and reference an alternate path when running the harness (see `--workflow` flag).

## 2. Prepare Test Inputs
- Capture three prompt payloads that mirror actual usage:
  - `book_small.json` (≤10 pages, minimal ControlNet).
  - `book_medium.json` (default story).
  - `book_large.json` (max pages / ControlNet heavy).
- Store them under `infra/comfyui/samples/` for reuse.

## 3. Run the Harness
```bash
cd infra/comfyui/load_test
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Example: 12 jobs, concurrency 4
python run_load_test.py \
  --server http://127.0.0.1:8188 \
  --workflow ../samples/book_medium.json \
  --jobs 12 \
  --concurrency 4 \
  --timeout 420 \
  --output ../../observability/load_2024-06-xx.json
```

Tips:
- Start with low concurrency (2) to validate correctness, then increase until GPU utilization hits 90% or failure rate rises.
- Repeat for each sample payload so you understand scale vs. complexity.

## 4. Capture Metrics
1. While the harness runs, tail the instrumentation log:
   ```bash
   tail -f infra/observability/comfyui_metrics.ndjson
   ```
2. After the run, archive the log and load-test output JSON into `infra/observability/baselines/<date>/`.
3. Compute quick stats:
   ```bash
   jq '.summary' infra/observability/baselines/<date>/load*.json
   ```

## 5. Document Baseline
Create `infra/observability/baselines/<date>/README.md` with:
- Hardware (eGPU enclosure, driver version).
- ComfyUI commit hash/custom nodes.
- Harness parameters (`jobs`, `concurrency`, workflow file).
- Summary metrics (avg/p95 latency, success %, `images_per_minute`).
- Observations (GPU memory headroom, any failures).

## 6. Acceptance Criteria
- Success rate ≥ target SLA (e.g., 98%).
- p95 latency ≤ stakeholder goal (e.g., 45 s).
- NDJSON log shows no unexpected errors/exceptions.
- Notes on when GPU saturates → feed back into retry/backoff settings.

Once this checklist is complete, proceed to implementing automatic retries & UI surfacing (Step 3).***
