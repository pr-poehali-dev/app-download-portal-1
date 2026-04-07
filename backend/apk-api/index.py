"""
API для управления APK-файлами и загрузками.
Все запросы — POST на /, поле action определяет операцию:
  get_files, add_file, toggle_favorite,
  get_downloads, add_download, update_download
"""
import json
import os
import psycopg2
import psycopg2.extras

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
}

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p39447125_app_download_portal_")


def get_conn():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    return conn


def ok(data):
    return {"statusCode": 200, "headers": CORS, "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, status=400):
    return {"statusCode": status, "headers": CORS, "body": json.dumps({"error": msg}, ensure_ascii=False)}


def action_get_files(conn, _body):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(f"""
            SELECT f.id, f.name, f.package_name, f.icon, f.current_version,
                   f.size, f.source, f.download_date::text, f.is_favorite, f.url,
                   json_agg(
                       json_build_object(
                           'version', v.version,
                           'date', v.released_date::text,
                           'size', v.size,
                           'notes', v.notes
                       ) ORDER BY v.created_at DESC
                   ) FILTER (WHERE v.id IS NOT NULL) as versions
            FROM {SCHEMA}.apk_files f
            LEFT JOIN {SCHEMA}.apk_versions v ON v.file_id = f.id
            GROUP BY f.id
            ORDER BY f.created_at DESC
        """)
        rows = cur.fetchall()
    result = []
    for r in rows:
        r = dict(r)
        r["versions"] = r["versions"] or []
        result.append(r)
    return ok({"files": result})


def action_add_file(conn, body):
    name = body.get("name", "")
    package_name = body.get("packageName", body.get("package_name", ""))
    icon = body.get("icon", "Package")
    version = body.get("version", "")
    size = body.get("size", "")
    source = body.get("source", "")
    url = body.get("url", "")

    if not name:
        return err("name обязателен")

    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.apk_files (name, package_name, icon, current_version, size, source, url)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
        """, (name, package_name, icon, version, size, source, url))
        file_id = cur.fetchone()[0]

        if version:
            cur.execute(f"""
                INSERT INTO {SCHEMA}.apk_versions (file_id, version, size, released_date)
                VALUES (%s, %s, %s, CURRENT_DATE)
            """, (file_id, version, size))

    return ok({"ok": True, "id": file_id})


def action_toggle_favorite(conn, body):
    file_id = body.get("id")
    if not file_id:
        return err("id обязателен")
    with conn.cursor() as cur:
        cur.execute(f"""
            UPDATE {SCHEMA}.apk_files
            SET is_favorite = NOT is_favorite
            WHERE id = %s RETURNING is_favorite
        """, (file_id,))
        row = cur.fetchone()
    if not row:
        return err("Файл не найден", 404)
    return ok({"ok": True, "isFavorite": row[0]})


def action_get_downloads(conn, _body):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(f"""
            SELECT id, name, url, progress, status, size, version, created_at::text
            FROM {SCHEMA}.downloads
            ORDER BY created_at DESC
            LIMIT 50
        """)
        rows = [dict(r) for r in cur.fetchall()]
    return ok({"downloads": rows})


def action_add_download(conn, body):
    url = body.get("url", "")
    if not url:
        return err("url обязателен")
    name = body.get("name", "") or url.split("/")[-1]
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.downloads (name, url, status, progress)
            VALUES (%s, %s, 'fetching', 0) RETURNING id
        """, (name, url))
        dl_id = cur.fetchone()[0]
    return ok({"ok": True, "id": dl_id})


def action_update_download(conn, body):
    dl_id = body.get("id")
    if not dl_id:
        return err("id обязателен")
    allowed = ("name", "progress", "status", "size", "version")
    fields, vals = [], []
    for key in allowed:
        if key in body:
            fields.append(f"{key} = %s")
            vals.append(body[key])
    if not fields:
        return err("Нет полей для обновления")
    vals.append(dl_id)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {SCHEMA}.downloads SET {', '.join(fields)} WHERE id = %s",
            vals,
        )
    return ok({"ok": True})


ACTIONS = {
    "get_files": action_get_files,
    "add_file": action_add_file,
    "toggle_favorite": action_toggle_favorite,
    "get_downloads": action_get_downloads,
    "add_download": action_add_download,
    "update_download": action_update_download,
}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            return err("Невалидный JSON")

    action = body.get("action", "")
    if action not in ACTIONS:
        return err(f"Неизвестный action: '{action}'")

    conn = get_conn()
    return ACTIONS[action](conn, body)
