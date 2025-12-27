BASE_WORKFLOW = {}


DEFAULT_WORKFLOWS = [
    {
        "slug": "base",
        "name": "Base Workflow",
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
