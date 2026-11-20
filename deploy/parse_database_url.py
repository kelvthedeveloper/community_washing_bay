import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


database_url, password_file = sys.argv[1:]
parsed = urlsplit(database_url)
if parsed.scheme not in {"postgres", "postgresql"}:
    raise SystemExit("DATABASE_URL must use the postgres or postgresql scheme.")

values = {
    "host": parsed.hostname,
    "port": parsed.port or 5432,
    "database": unquote(parsed.path.lstrip("/")),
    "username": unquote(parsed.username or ""),
    "password": unquote(parsed.password or ""),
}
if not all(values[key] for key in ("host", "database", "username", "password")):
    raise SystemExit("DATABASE_URL must include host, database, username, and password.")
if any("\n" in str(value) or "\r" in str(value) for value in values.values()):
    raise SystemExit("DATABASE_URL values must not contain line breaks.")

def escape_pgpass(value):
    return str(value).replace("\\", "\\\\").replace(":", "\\:")


Path(password_file).write_text(
    ":".join(
        escape_pgpass(values[key])
        for key in ("host", "port", "database", "username", "password")
    )
    + "\n",
    encoding="utf-8",
)
os.chmod(password_file, 0o600)

query = parse_qs(parsed.query)
settings = (
    values["host"],
    str(values["port"]),
    values["database"],
    values["username"],
    query.get("sslmode", ["require"])[0],
)
for setting in settings:
    sys.stdout.buffer.write(setting.encode() + b"\0")
