#!/usr/bin/env python3
import argparse
import json
import statistics
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List

import requests

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover - optional dependency
    tqdm = lambda x, **_: x  # type: ignore

POLL_INTERVAL = 2


def queue_prompt(server: str, workflow: Dict[str, Any], session: requests.Session) -> str:
    resp = session.post(
        f"{server.rstrip('/')}/prompt",
        json={"prompt": workflow, "client_id": str(uuid.uuid4())},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["prompt_id"]


def poll_prompt(server: str, prompt_id: str, session: requests.Session, timeout: int) -> Dict[str, Any]:
    start = time.time()
    polls = 0
    while time.time() - start < timeout:
        polls += 1
        resp = session.get(f"{server.rstrip('/')}/history/{prompt_id}", timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            if prompt_id in data:
                entry = data[prompt_id]
                outputs = entry.get("outputs")
                status_block = entry.get("status") or {}

                if outputs:
                    return {"status": "completed", "outputs": outputs, "polls": polls}

                if status_block.get("error"):
                    return {
                        "status": "failed",
                        "error": status_block.get("error"),
                        "polls": polls,
                    }
        time.sleep(POLL_INTERVAL)
    return {
        "status": "timeout",
        "error": f"No completion after {timeout}s",
        "polls": polls,
    }


def run_job(job_id: int, server: str, workflow: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    session = requests.Session()
    result: Dict[str, Any] = {"job_id": job_id}
    started = time.time()
    try:
        prompt_id = queue_prompt(server, workflow, session)
        result["prompt_id"] = prompt_id
        completion = poll_prompt(server, prompt_id, session, timeout)
        result.update(completion)
    except Exception as exc:
        result["status"] = "failed"
        result["error"] = str(exc)
        result["polls"] = result.get("polls", 0)
    finally:
        result["duration_sec"] = round(time.time() - started, 2)
    return result


def summarize(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    durations = [r["duration_sec"] for r in results if r.get("status") == "completed"]
    throughput_window = sum(r["duration_sec"] for r in results) or 1
    summary = {
        "total_jobs": len(results),
        "completed": sum(1 for r in results if r.get("status") == "completed"),
        "failed": sum(1 for r in results if r.get("status") == "failed"),
        "timeouts": sum(1 for r in results if r.get("status") == "timeout"),
        "avg_duration_sec": round(statistics.mean(durations), 2) if durations else None,
        "p95_duration_sec": round(statistics.quantiles(durations, n=20)[18], 2) if len(durations) >= 20 else (round(statistics.median(durations), 2) if durations else None),
        "images_per_minute": round((len(durations) / throughput_window) * 60, 2),
    }
    return summary


def main():
    parser = argparse.ArgumentParser(description="Hammer ComfyUI with concurrent workflow executions.")
    parser.add_argument("--server", required=True, help="ComfyUI server base URL, e.g. http://127.0.0.1:8188")
    parser.add_argument("--workflow", required=True, type=Path, help="Workflow JSON file exported via Save > API Format")
    parser.add_argument("--jobs", type=int, default=4, help="Total prompts to queue")
    parser.add_argument("--concurrency", type=int, default=2, help="Concurrent workers")
    parser.add_argument("--timeout", type=int, default=300, help="Seconds to wait for each prompt")
    parser.add_argument("--output", type=Path, help="Optional path to write detailed results JSON")
    args = parser.parse_args()

    workflow = json.loads(args.workflow.read_text(encoding="utf-8"))

    print(f"Running {args.jobs} jobs against {args.server} with concurrency={args.concurrency}")
    t0 = time.time()
    results: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [executor.submit(run_job, idx, args.server, workflow, args.timeout) for idx in range(args.jobs)]
        for future in tqdm(as_completed(futures), total=len(futures)):
            results.append(future.result())

    total_time = round(time.time() - t0, 2)
    summary = summarize(results)
    summary["wall_clock_sec"] = total_time

    print("\n=== Load Test Summary ===")
    print(json.dumps(summary, indent=2))

    if args.output:
        payload = {"summary": summary, "results": results}
        args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"\nDetailed results saved to {args.output}")


if __name__ == "__main__":
    main()
