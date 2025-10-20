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
        "ALTER TABLE story_templates ADD COLUMN price_dollars INTEGER DEFAULT 1",
        "ALTER TABLE story_templates ADD COLUMN free_trial_slug VARCHAR(120)",
        "ALTER TABLE users ADD COLUMN free_trials_used JSON",
        "CREATE TABLE IF NOT EXISTS payments (\n            id SERIAL PRIMARY KEY,\n            user_id INTEGER NOT NULL REFERENCES users(id),\n            book_id INTEGER REFERENCES books(id),\n            story_template_slug VARCHAR(100),\n            amount_dollars INTEGER NOT NULL DEFAULT 0,\n            currency VARCHAR(10) NOT NULL DEFAULT 'usd',\n            method VARCHAR(20) NOT NULL,\n            stripe_payment_intent_id VARCHAR(255),\n            status VARCHAR(50) NOT NULL,\n            metadata JSON,\n            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n        )",
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
        "UPDATE story_templates SET price_dollars = COALESCE(price_dollars, 1)",
        "UPDATE users SET free_trials_used = '[]'::json WHERE free_trials_used IS NULL",
    ]

    with engine.connect() as conn:
        for stmt in post_updates:
            trans = conn.begin()
            try:
                conn.execute(text(stmt))
                trans.commit()
            except Exception:
                trans.rollback()
