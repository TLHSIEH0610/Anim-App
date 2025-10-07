"""
Migration script to rename original_image_path to original_image_paths
Run this script once to update the database schema
"""

import os
import sys
from sqlalchemy import create_engine, text

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db import engine

def migrate():
    print("Starting migration: original_image_path -> original_image_paths")

    with engine.connect() as conn:
        # Check if the old column exists
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'books'
            AND column_name = 'original_image_path'
        """))

        old_column_exists = result.fetchone() is not None

        if old_column_exists:
            print("✓ Found old column 'original_image_path', renaming to 'original_image_paths'")

            # Rename the column
            conn.execute(text("""
                ALTER TABLE books
                RENAME COLUMN original_image_path TO original_image_paths
            """))
            conn.commit()

            print("✅ Migration completed successfully!")
        else:
            print("⚠️  Column 'original_image_path' not found. Checking for 'original_image_paths'...")

            result = conn.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'books'
                AND column_name = 'original_image_paths'
            """))

            new_column_exists = result.fetchone() is not None

            if new_column_exists:
                print("✅ Column 'original_image_paths' already exists. No migration needed.")
            else:
                print("❌ Neither column found. The books table may not exist yet.")
                print("   Run the backend server first to create tables.")

if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
