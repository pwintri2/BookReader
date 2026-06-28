#!/usr/bin/env python3
"""SQLite library adapter for BookReader projects.

The BookReader UI runs on Node, while this laptop already has SQLite through
Python's standard library. Keeping the database adapter here avoids a native
Node dependency and also gives us a reusable import command for old JSON files.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any


SCHEMA = "bookreader.project.v1"
MAX_PROJECT_BYTES = 50 * 1024 * 1024
PROJECT_FILE_PATTERN = re.compile(r"\.bookreader(?:\s*\(\d+\))?\.json$", re.IGNORECASE)
WORD_PATTERN = re.compile(r"\b[\wÀ-ÿ'-]+\b", re.UNICODE)


def main() -> int:
    parser = argparse.ArgumentParser(description="BookReader SQLite library")
    parser.add_argument("command", choices=["init", "import", "list", "open", "save", "delete", "categories", "create-category", "assign-category"])
    parser.add_argument("--db", required=True, help="SQLite database path")
    parser.add_argument("--path", action="append", default=[], help="File or directory to import")
    parser.add_argument("--id", default="", help="Project id for open")
    parser.add_argument("--name", default="", help="Category name")
    parser.add_argument("--project-id", default="", help="Project id for category assignment")
    parser.add_argument("--category-id", default="", help="Category id")
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    args = parser.parse_args()

    try:
        db_path = Path(args.db).expanduser().resolve()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            ensure_schema(conn)
            if args.command == "init":
                result = {"ok": True, "dbPath": str(db_path)}
            elif args.command == "import":
                result = import_paths(conn, args.path)
                result["dbPath"] = str(db_path)
            elif args.command == "list":
                result = {"ok": True, "dbPath": str(db_path), "projects": list_projects(conn)}
            elif args.command == "open":
                result = open_project(conn, args.id)
            elif args.command == "save":
                payload = json.loads(sys.stdin.read() or "{}")
                result = save_payload_project(conn, payload)
                result["dbPath"] = str(db_path)
            elif args.command == "delete":
                result = delete_project(conn, args.id)
                result["dbPath"] = str(db_path)
                conn.commit()
            elif args.command == "categories":
                result = {"ok": True, "dbPath": str(db_path), "categories": list_categories(conn)}
            elif args.command == "create-category":
                result = {"ok": True, "dbPath": str(db_path), "category": create_category(conn, args.name)}
                conn.commit()
            elif args.command == "assign-category":
                result = assign_category(conn, args.project_id, args.category_id)
                result["dbPath"] = str(db_path)
                conn.commit()
            else:
                raise ValueError(f"Unsupported command: {args.command}")
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:  # pragma: no cover - surfaced to Node/CLI callers.
        error = {"ok": False, "error": exc.__class__.__name__, "message": str(exc)}
        print(json.dumps(error, ensure_ascii=False), file=sys.stderr)
        return 1


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            schema TEXT NOT NULL,
            title TEXT NOT NULL,
            saved_at TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            illustration_style_id TEXT NOT NULL,
            chapter_illustrations_json TEXT NOT NULL,
            character_portraits_json TEXT NOT NULL,
            book_cover_json TEXT,
            context_analysis_json TEXT,
            film_plan_json TEXT,
            project_json TEXT NOT NULL,
            source_path TEXT,
            file_name TEXT,
            content_hash TEXT NOT NULL,
            word_count INTEGER NOT NULL,
            chapter_count INTEGER NOT NULL,
            preview TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            imported_at TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_projects_saved_at ON projects(saved_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_projects_title ON projects(title)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_projects_content_hash ON projects(content_hash)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS project_categories (
            project_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (project_id, category_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_project_categories_category ON project_categories(category_id)")


def import_paths(conn: sqlite3.Connection, raw_paths: list[str]) -> dict[str, Any]:
    files: list[Path] = []
    seen: set[Path] = set()
    for raw_path in raw_paths:
        path = Path(raw_path).expanduser().resolve()
        for file_path in collect_project_files(path):
            if file_path in seen:
                continue
            seen.add(file_path)
            files.append(file_path)

    imported = 0
    skipped = 0
    projects = []
    for file_path in files:
        record = read_project_file(file_path)
        if not record:
            skipped += 1
            continue
        summary = upsert_project(conn, record["project"], source_path=str(file_path), file_name=file_path.name)
        imported += 1
        projects.append(summary)

    conn.commit()
    return {"ok": True, "imported": imported, "skipped": skipped, "projects": projects}


def collect_project_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path] if is_project_file_name(path.name) else []
    if not path.is_dir():
        return []

    files: list[Path] = []
    for file_path in path.rglob("*"):
        if len(files) >= 500:
            break
        if file_path.is_file() and is_project_file_name(file_path.name):
            files.append(file_path.resolve())
    return sorted(files)


def is_project_file_name(file_name: str) -> bool:
    return bool(PROJECT_FILE_PATTERN.search(file_name))


def read_project_file(file_path: Path) -> dict[str, Any] | None:
    try:
        if file_path.stat().st_size > MAX_PROJECT_BYTES:
            return None
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        if not is_project(payload):
            return None
        return {"project": normalize_project(payload, fallback_saved_at=mtime_iso(file_path))}
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def is_project(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get("schema") == SCHEMA
        and isinstance(value.get("title"), str)
        and isinstance(value.get("rawText"), str)
    )


def normalize_project(project: dict[str, Any], fallback_saved_at: str | None = None) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "savedAt": str(project.get("savedAt") or fallback_saved_at or now_iso()),
        "title": str(project.get("title") or "Nieuw verhaal"),
        "rawText": str(project.get("rawText") or ""),
        "illustrationStyleId": str(project.get("illustrationStyleId") or "storybook"),
        "chapterIllustrations": project.get("chapterIllustrations") if isinstance(project.get("chapterIllustrations"), list) else [],
        "characterPortraits": project.get("characterPortraits") if isinstance(project.get("characterPortraits"), list) else [],
        "bookCover": project.get("bookCover") if isinstance(project.get("bookCover"), dict) else None,
        "contextAnalysis": project.get("contextAnalysis"),
        "filmPlan": project.get("filmPlan"),
        "storyPrompt": project.get("storyPrompt") if isinstance(project.get("storyPrompt"), dict) else None,
    }


def save_payload_project(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    project = payload.get("project") if isinstance(payload, dict) else None
    if not is_project(project):
        raise ValueError("Payload does not contain a valid BookReader project")

    summary = upsert_project(
        conn,
        normalize_project(project),
        source_path=payload.get("sourcePath") if isinstance(payload.get("sourcePath"), str) else None,
        file_name=payload.get("fileName") if isinstance(payload.get("fileName"), str) else None,
    )
    category_ids = payload.get("categoryIds") if isinstance(payload.get("categoryIds"), list) else []
    if category_ids:
        assign_project_categories(conn, summary["id"], [str(category_id) for category_id in category_ids])
        summary = project_summary_by_id(conn, summary["id"]) or summary
    conn.commit()
    return {"ok": True, "project": summary}


def upsert_project(
    conn: sqlite3.Connection,
    project: dict[str, Any],
    source_path: str | None = None,
    file_name: str | None = None,
) -> dict[str, Any]:
    project_json = canonical_json(project)
    content_hash = hashlib.sha256(project_json.encode("utf-8")).hexdigest()
    project_id = f"br_{content_hash[:32]}"
    now = now_iso()
    saved_at = str(project.get("savedAt") or now)
    raw_text = str(project.get("rawText") or "")
    summary = {
        "id": project_id,
        "title": str(project.get("title") or "Nieuw verhaal"),
        "savedAt": saved_at,
        "wordCount": count_words(raw_text),
        "chapterCount": estimate_chapter_count(raw_text),
        "preview": project_preview(raw_text),
        "fileName": file_name or "",
        "sourcePath": source_path or "",
        "updatedAt": now,
    }
    values = {
        **summary,
        "schema": SCHEMA,
        "rawText": raw_text,
        "illustrationStyleId": str(project.get("illustrationStyleId") or "storybook"),
        "chapterIllustrationsJson": canonical_json(project.get("chapterIllustrations") or []),
        "characterPortraitsJson": canonical_json(project.get("characterPortraits") or []),
        "bookCoverJson": canonical_json(project.get("bookCover")) if project.get("bookCover") is not None else None,
        "contextAnalysisJson": canonical_json(project.get("contextAnalysis")) if project.get("contextAnalysis") is not None else None,
        "filmPlanJson": canonical_json(project.get("filmPlan")) if project.get("filmPlan") is not None else None,
        "projectJson": project_json,
        "contentHash": content_hash,
        "createdAt": now,
        "importedAt": now if source_path else None,
    }
    conn.execute(
        """
        INSERT INTO projects (
            id, schema, title, saved_at, raw_text, illustration_style_id,
            chapter_illustrations_json, character_portraits_json, book_cover_json,
            context_analysis_json, film_plan_json, project_json, source_path, file_name,
            content_hash, word_count, chapter_count, preview, created_at, updated_at, imported_at
        ) VALUES (
            :id, :schema, :title, :savedAt, :rawText, :illustrationStyleId,
            :chapterIllustrationsJson, :characterPortraitsJson, :bookCoverJson,
            :contextAnalysisJson, :filmPlanJson, :projectJson, :sourcePath, :fileName,
            :contentHash, :wordCount, :chapterCount, :preview, :createdAt, :updatedAt, :importedAt
        )
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            saved_at = excluded.saved_at,
            raw_text = excluded.raw_text,
            illustration_style_id = excluded.illustration_style_id,
            chapter_illustrations_json = excluded.chapter_illustrations_json,
            character_portraits_json = excluded.character_portraits_json,
            book_cover_json = excluded.book_cover_json,
            context_analysis_json = excluded.context_analysis_json,
            film_plan_json = excluded.film_plan_json,
            project_json = excluded.project_json,
            source_path = COALESCE(NULLIF(excluded.source_path, ''), projects.source_path),
            file_name = COALESCE(NULLIF(excluded.file_name, ''), projects.file_name),
            content_hash = excluded.content_hash,
            word_count = excluded.word_count,
            chapter_count = excluded.chapter_count,
            preview = excluded.preview,
            updated_at = excluded.updated_at,
            imported_at = COALESCE(excluded.imported_at, projects.imported_at)
        """,
        values,
    )
    return summary


def list_projects(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, title, saved_at, word_count, chapter_count, preview, file_name, source_path, updated_at
        FROM projects
        ORDER BY datetime(saved_at) DESC, title COLLATE NOCASE ASC
        LIMIT 500
        """
    ).fetchall()
    summaries = [summary_from_row(row) for row in rows]
    attach_categories(conn, summaries)
    return summaries


def open_project(conn: sqlite3.Connection, project_id: str) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT id, title, saved_at, word_count, chapter_count, preview, file_name, source_path, updated_at, project_json
        FROM projects
        WHERE id = ?
        """,
        (project_id,),
    ).fetchone()
    if not row:
        return {"ok": False, "error": "project_not_found"}
    summary = summary_from_row(row)
    attach_categories(conn, [summary])
    return {"ok": True, "project": json.loads(row["project_json"]), "summary": summary}


def delete_project(conn: sqlite3.Connection, project_id: str) -> dict[str, Any]:
    summary = project_summary_by_id(conn, project_id)
    if not summary:
        return {"ok": False, "error": "project_not_found"}
    conn.execute("DELETE FROM project_categories WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return {"ok": True, "project": summary, "categories": list_categories(conn)}


def list_categories(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT c.id, c.name, c.created_at, c.updated_at, COUNT(pc.project_id) AS project_count
        FROM categories c
        LEFT JOIN project_categories pc ON pc.category_id = c.id
        GROUP BY c.id
        ORDER BY c.name COLLATE NOCASE ASC
        """
    ).fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "projectCount": int(row["project_count"]),
        }
        for row in rows
    ]


def create_category(conn: sqlite3.Connection, raw_name: str) -> dict[str, Any]:
    name = normalize_category_name(raw_name)
    if not name:
        raise ValueError("Category name is required")
    now = now_iso()
    category_id = f"cat_{slugify(name)[:48]}_{hashlib.sha256(name.lower().encode('utf-8')).hexdigest()[:10]}"
    conn.execute(
        """
        INSERT INTO categories (id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at
        """,
        (category_id, name, now, now),
    )
    row = conn.execute(
        """
        SELECT id, name, created_at, updated_at, 0 AS project_count
        FROM categories
        WHERE name = ? COLLATE NOCASE
        """,
        (name,),
    ).fetchone()
    return {
        "id": row["id"],
        "name": row["name"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "projectCount": int(row["project_count"]),
    }


def assign_category(conn: sqlite3.Connection, project_id: str, category_id: str) -> dict[str, Any]:
    if not project_exists(conn, project_id):
        return {"ok": False, "error": "project_not_found"}
    if not category_exists(conn, category_id):
        return {"ok": False, "error": "category_not_found"}
    assign_project_categories(conn, project_id, [category_id])
    summary = project_summary_by_id(conn, project_id)
    return {"ok": True, "project": summary, "categories": list_categories(conn)}


def assign_project_categories(conn: sqlite3.Connection, project_id: str, category_ids: list[str]) -> None:
    now = now_iso()
    for category_id in category_ids:
        if not category_exists(conn, category_id):
            continue
        conn.execute(
            """
            INSERT OR IGNORE INTO project_categories (project_id, category_id, created_at)
            VALUES (?, ?, ?)
            """,
            (project_id, category_id, now),
        )


def project_summary_by_id(conn: sqlite3.Connection, project_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT id, title, saved_at, word_count, chapter_count, preview, file_name, source_path, updated_at
        FROM projects
        WHERE id = ?
        """,
        (project_id,),
    ).fetchone()
    if not row:
        return None
    summary = summary_from_row(row)
    attach_categories(conn, [summary])
    return summary


def project_exists(conn: sqlite3.Connection, project_id: str) -> bool:
    return bool(conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone())


def category_exists(conn: sqlite3.Connection, category_id: str) -> bool:
    return bool(conn.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone())


def attach_categories(conn: sqlite3.Connection, summaries: list[dict[str, Any]]) -> None:
    if not summaries:
        return
    ids = [summary["id"] for summary in summaries]
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"""
        SELECT pc.project_id, c.id, c.name
        FROM project_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.project_id IN ({placeholders})
        ORDER BY c.name COLLATE NOCASE ASC
        """,
        ids,
    ).fetchall()
    by_project: dict[str, list[dict[str, str]]] = {project_id: [] for project_id in ids}
    for row in rows:
        by_project[row["project_id"]].append({"id": row["id"], "name": row["name"]})
    for summary in summaries:
        categories = by_project.get(summary["id"], [])
        summary["categories"] = categories
        summary["categoryIds"] = [category["id"] for category in categories]


def summary_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "savedAt": row["saved_at"],
        "wordCount": int(row["word_count"]),
        "chapterCount": int(row["chapter_count"]),
        "preview": row["preview"],
        "fileName": row["file_name"] or "",
        "sourcePath": row["source_path"] or "",
        "updatedAt": row["updated_at"],
        "categories": [],
        "categoryIds": [],
    }


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def count_words(text: str) -> int:
    return len(WORD_PATTERN.findall(text))


def estimate_chapter_count(text: str) -> int:
    if not text.strip():
        return 0
    page_markers = len(re.findall(r"^##\s+", text, flags=re.MULTILINE))
    if page_markers:
        return page_markers
    headings = len(re.findall(r"^(?:hoofdstuk|chapter|pagina|page)\s+\d+", text, flags=re.IGNORECASE | re.MULTILINE))
    return headings or 1


def project_preview(text: str) -> str:
    cleaned = re.sub(r"^#{1,3}\s+.+$", " ", text, flags=re.MULTILINE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return (cleaned[:147] + "...") if len(cleaned) > 150 else cleaned or "Leeg verhaal"


def normalize_category_name(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "")).strip()[:80]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "categorie"


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def mtime_iso(path: Path) -> str:
    return dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
