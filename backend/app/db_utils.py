from sqlalchemy import text


def apply_schema_patches(engine):
    statements = [
        "ALTER TABLE book_workflow_snapshots ADD COLUMN workflow_version INTEGER",
        "ALTER TABLE book_workflow_snapshots ADD COLUMN workflow_slug VARCHAR(100)",
        "ALTER TABLE story_template_pages ADD COLUMN controlnet_image VARCHAR(150)",
        "ALTER TABLE story_template_pages ADD COLUMN keypoint_image VARCHAR(150)",
        "ALTER TABLE story_template_pages ADD COLUMN negative_prompt TEXT",
        "ALTER TABLE controlnet_images ADD COLUMN preview_path TEXT",
        "ALTER TABLE controlnet_images ADD COLUMN metadata JSON",
    ]

    with engine.connect() as conn:
        for stmt in statements:
            trans = conn.begin()
            try:
                conn.execute(text(stmt))
                trans.commit()
            except Exception as exc:
                trans.rollback()
                message = str(exc).lower()
                if "already exists" in message or "duplicate" in message or "duplicate column" in message:
                    continue
                raise

    post_updates = [
        "UPDATE book_workflow_snapshots SET workflow_slug = COALESCE(workflow_slug, 'legacy')",
        "UPDATE book_workflow_snapshots SET workflow_version = COALESCE(workflow_version, 0)",
    ]

    with engine.connect() as conn:
        for stmt in post_updates:
            trans = conn.begin()
            try:
                conn.execute(text(stmt))
                trans.commit()
            except Exception:
                trans.rollback()
