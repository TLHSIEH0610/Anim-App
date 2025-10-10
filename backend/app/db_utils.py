from sqlalchemy import text


def apply_schema_patches(engine):
    statements = [
        "ALTER TABLE book_workflow_snapshots ADD COLUMN workflow_version INTEGER",
        "ALTER TABLE book_workflow_snapshots ADD COLUMN workflow_slug VARCHAR(100)",
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
