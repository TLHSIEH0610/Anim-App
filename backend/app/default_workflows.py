BASE_WORKFLOW = {
    "3": {
        "inputs": {
            "seed": 498060263730812,
            "steps": 25,
            "cfg": 4.5,
            "sampler_name": "ddpm",
            "scheduler": "karras",
            "denoise": 1,
            "model": ["60", 0],
            "positive": ["60", 1],
            "negative": ["60", 2],
            "latent_image": ["5", 0],
        },
        "class_type": "KSampler",
        "_meta": {"title": "KSampler"},
    },
    "4": {
        "inputs": {"ckpt_name": "wildcardxXLANIMATION_wildcardxXLANIMATION.safetensors"},
        "class_type": "CheckpointLoaderSimple",
        "_meta": {"title": "Load Checkpoint"},
    },
    "5": {
        "inputs": {"width": 960, "height": 960, "batch_size": 1},
        "class_type": "EmptyLatentImage",
        "_meta": {"title": "Empty Latent Image"},
    },
    "8": {
        "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
        "class_type": "VAEDecode",
        "_meta": {"title": "VAEDecode"},
    },
    "11": {
        "inputs": {"instantid_file": "ip-adapter.bin"},
        "class_type": "InstantIDModelLoader",
        "_meta": {"title": "Load InstantID Model"},
    },
    "13": {
        "inputs": {"image": "character_0.png"},
        "class_type": "LoadImage",
        "_meta": {"title": "Load Image"},
    },
    "15": {
        "inputs": {"images": ["8", 0]},
        "class_type": "PreviewImage",
        "_meta": {"title": "Preview Image"},
    },
    "16": {
        "inputs": {"control_net_name": "diffusion_pytorch_model.safetensors"},
        "class_type": "ControlNetLoader",
        "_meta": {"title": "Load ControlNet Model"},
    },
    "38": {
        "inputs": {"provider": "CPU"},
        "class_type": "InstantIDFaceAnalysis",
        "_meta": {"title": "InstantID Face Analysis"},
    },
    "39": {
        "inputs": {
            "text": "masterpiece, best quality, adventure illustration",
            "clip": ["99", 1],
        },
        "class_type": "CLIPTextEncode",
        "_meta": {"title": "CLIP Text Encode (Prompt)"},
    },
    "40": {
        "inputs": {
            "text": "text, watermark, low quality, blurry, distorted",
            "clip": ["99", 1],
        },
        "class_type": "CLIPTextEncode",
        "_meta": {"title": "CLIP Text Encode (Prompt)"},
    },
    "60": {
        "inputs": {
            "weight": 0.8,
            "start_at": 0,
            "end_at": 1,
            "instantid": ["11", 0],
            "insightface": ["38", 0],
            "control_net": ["16", 0],
            "image": ["95", 0],
            "model": ["99", 0],
            "positive": ["39", 0],
            "negative": ["40", 0],
            "image_kps": ["100", 0],
        },
        "class_type": "ApplyInstantID",
        "_meta": {"title": "Apply InstantID"},
    },
    "75": {
        "inputs": {"image1": ["13", 0], "image2": ["94", 0]},
        "class_type": "ImageBatch",
        "_meta": {"title": "Batch Images"},
    },
    "77": {
        "inputs": {"control_net_name": "control-lora-depth-rank256.safetensors"},
        "class_type": "ControlNetLoader",
        "_meta": {"title": "Load ControlNet Model"},
    },
    "94": {
        "inputs": {"image": "character_1.png"},
        "class_type": "LoadImage",
        "_meta": {"title": "Load Image"},
    },
    "95": {
        "inputs": {"image1": ["75", 0], "image2": ["98", 0]},
        "class_type": "ImageBatch",
        "_meta": {"title": "Batch Images"},
    },
    "98": {
        "inputs": {"image": "character_2.png"},
        "class_type": "LoadImage",
        "_meta": {"title": "Load Image"},
    },
    "99": {
        "inputs": {
            "lora_name": "picbookXLloraV1.safetensors",
            "strength_model": 0.64,
            "strength_clip": 1,
            "model": ["4", 0],
            "clip": ["4", 1],
        },
        "class_type": "LoraLoader",
        "_meta": {"title": "Load LoRA"},
    },
    "100": {
        "inputs": {"image": "keypoint_default.png"},
        "class_type": "LoadImage",
        "_meta": {"title": "Load Image"},
    },
}


DEFAULT_WORKFLOWS = [
    {
        "slug": "base",
        "name": "Base Keypoint Workflow",
        "type": "template",
        "version": 1,
        "content": BASE_WORKFLOW,
    }
]


def ensure_default_workflows(session_factory):
    from app.fixtures import load_workflow_fixtures
    from app.models import WorkflowDefinition  # local import to avoid circular

    session = session_factory()
    try:
        # Seed workflows *only* when the table is empty.
        # This gives admins full control to delete/modify workflows (including "base")
        # without them being recreated on every startup from fixtures.
        existing_count = session.query(WorkflowDefinition).count()
        if existing_count > 0:
            return

        fixture_records = load_workflow_fixtures()
        payloads = [record for _, record in fixture_records] or DEFAULT_WORKFLOWS

        for wf in payloads:
            slug = wf.get("slug")
            if not slug:
                continue
            version = wf.get("version") or 1
            exists = (
                session.query(WorkflowDefinition)
                .filter(WorkflowDefinition.slug == slug, WorkflowDefinition.version == version)
                .first()
            )
            if exists:
                continue
            definition = WorkflowDefinition(
                slug=slug,
                name=wf.get("name") or slug,
                type=wf.get("type") or "template",
                version=version,
                content=wf.get("content") or {},
                is_active=bool(wf.get("is_active", True)),
            )
            session.add(definition)
        session.commit()
    finally:
        session.close()
