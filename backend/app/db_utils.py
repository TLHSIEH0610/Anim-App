from sqlalchemy import text
from textwrap import dedent


def apply_schema_patches(engine):
    statements = [
        "ALTER TABLE book_workflow_snapshots ADD COLUMN workflow_version INTEGER",
        "ALTER TABLE book_workflow_snapshots ADD COLUMN workflow_slug VARCHAR(100)",
        "ALTER TABLE story_template_pages ADD COLUMN controlnet_image VARCHAR(150)",
        "ALTER TABLE story_template_pages ADD COLUMN keypoint_image VARCHAR(150)",
        "ALTER TABLE story_template_pages ADD COLUMN negative_prompt TEXT",
        "ALTER TABLE controlnet_images ADD COLUMN preview_path TEXT",
        "ALTER TABLE controlnet_images ADD COLUMN metadata JSON",
        "ALTER TABLE story_templates ADD COLUMN price_dollars NUMERIC(10,2) DEFAULT 1.5",
        "ALTER TABLE story_templates ADD COLUMN discount_price NUMERIC(10,2)",
        "ALTER TABLE story_templates ADD COLUMN free_trial_slug VARCHAR(120)",
        "ALTER TABLE users ADD COLUMN free_trials_used JSON",
        "ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'",
        dedent(
            """
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                book_id INTEGER REFERENCES books(id),
                story_template_slug VARCHAR(100),
                amount_dollars NUMERIC(10,2) NOT NULL DEFAULT 0,
                currency VARCHAR(10) NOT NULL DEFAULT 'aud',
                method VARCHAR(20) NOT NULL,
                stripe_payment_intent_id VARCHAR(255),
                status VARCHAR(50) NOT NULL,
                metadata JSON,
                credits_used NUMERIC(10,2) NOT NULL DEFAULT 0.00,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        ),
        "ALTER TABLE story_templates ALTER COLUMN price_dollars TYPE NUMERIC(10,2) USING price_dollars::numeric",
        "ALTER TABLE story_templates ALTER COLUMN price_dollars SET DEFAULT 1.5",
        "ALTER TABLE story_templates ALTER COLUMN price_dollars SET NOT NULL",
        "ALTER TABLE payments ALTER COLUMN amount_dollars TYPE NUMERIC(10,2) USING amount_dollars::numeric",
        "ALTER TABLE payments ALTER COLUMN currency SET DEFAULT 'aud'",
        "ALTER TABLE payments ADD COLUMN credits_used NUMERIC(10,2) DEFAULT 0.00",
        "ALTER TABLE users ALTER COLUMN credits TYPE NUMERIC(10,2) USING credits::numeric",
        "ALTER TABLE users ALTER COLUMN credits SET DEFAULT 0.00",
        "ALTER TABLE payments ALTER COLUMN credits_used TYPE NUMERIC(10,2) USING credits_used::numeric",
        "ALTER TABLE payments ALTER COLUMN credits_used SET DEFAULT 0.00",
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
        "UPDATE story_templates SET price_dollars = COALESCE(price_dollars, 1.5)",
        "UPDATE users SET free_trials_used = '[]'::json WHERE free_trials_used IS NULL",
        "UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''",
        "UPDATE users SET credits = COALESCE(credits, 0.00)",
        "UPDATE payments SET currency = 'aud' WHERE currency IS NULL OR currency = ''",
        "UPDATE payments SET credits_used = COALESCE(credits_used, 0.00)",
    ]

    with engine.connect() as conn:
        for stmt in post_updates:
            trans = conn.begin()
            try:
                conn.execute(text(stmt))
                trans.commit()
            except Exception:
                trans.rollback()
