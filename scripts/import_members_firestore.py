"""Import Master List Format Excel rows into Cloud Firestore (members collection).

Configuration: copy config/import.example.json to config/import.json and set excel_path.
Firebase Admin credentials: set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON,
or place serviceAccount.json in project root (gitignored).

Usage:
  pip install -e ".[import]"
  python scripts/import_members_firestore.py
  python scripts/import_members_firestore.py --config path/to/import.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    import openpyxl
except ImportError as e:
    print('Missing dependency. Install with: pip install -e ".[import]"')
    raise SystemExit(1) from e

# Column order matches "Master List Format" template (25 columns)
FIELD_NAMES = [
    "sl",
    "lastName",
    "firstName",
    "spouse",
    "membershipType",
    "membershipNumber",
    "status",
    "receipt",
    "year",
    "editedAt",
    "address",
    "apartment",
    "city",
    "state",
    "zip",
    "homePhone",
    "businessPhone",
    "cellPhone",
    "email",
    "business",
    "alternatePhone",
    "childDetail1",
    "childDetail2",
    "childDetail3",
    "childDetail4",
]


def load_config(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def cell_to_jsonable(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (int, float, str, bool)):
        return value
    return str(value)


def normalize_phone(value) -> str | None:
    if value is None or value == "":
        return None
    digits = re.sub(r"\D", "", str(value))
    return digits or None


def row_to_member(row: tuple) -> dict:
    raw: dict = {}
    for i, name in enumerate(FIELD_NAMES):
        raw[name] = cell_to_jsonable(row[i] if i < len(row) else None)

    for key in (
        "lastName",
        "firstName",
        "spouse",
        "membershipType",
        "status",
        "address",
        "apartment",
        "city",
        "state",
        "email",
        "business",
        "homePhone",
        "businessPhone",
        "cellPhone",
        "alternatePhone",
        "childDetail1",
        "childDetail2",
        "childDetail3",
        "childDetail4",
    ):
        v = raw.get(key)
        if v is not None and not isinstance(v, str):
            raw[key] = str(v).strip() or None
        elif isinstance(v, str):
            raw[key] = v.strip() or None

    for key in ("receipt", "year", "membershipNumber", "sl"):
        v = raw.get(key)
        if v is None or v == "":
            raw[key] = None
        elif isinstance(v, float) and v.is_integer():
            raw[key] = int(v)
        elif isinstance(v, str) and v.strip().isdigit():
            raw[key] = int(v.strip())

    phones = [
        normalize_phone(raw.get("homePhone")),
        normalize_phone(raw.get("businessPhone")),
        normalize_phone(raw.get("cellPhone")),
        normalize_phone(raw.get("alternatePhone")),
    ]
    raw["phoneDigits"] = [p for p in phones if p]

    parts = [
        (raw.get("firstName") or "").lower(),
        (raw.get("lastName") or "").lower(),
        (raw.get("spouse") or "").lower(),
        (raw.get("email") or "").lower(),
        *raw["phoneDigits"],
    ]
    raw["searchText"] = " ".join(x for x in parts if x)

    return raw


def init_firebase() -> firestore.Client:
    sa = ROOT / "serviceAccount.json"
    try:
        firebase_admin.get_app()
    except ValueError:
        if sa.is_file():
            firebase_admin.initialize_app(credentials.Certificate(str(sa)))
        elif os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            firebase_admin.initialize_app(credentials.ApplicationDefault())
        else:
            raise SystemExit(
                "Set GOOGLE_APPLICATION_CREDENTIALS or add serviceAccount.json "
                "(see web/env.example)."
            ) from None
    return firestore.client()


def import_excel(cfg: dict, db: firestore.Client | None, dry_run: bool) -> None:
    excel_path = Path(cfg["excel_path"]).expanduser()
    if not excel_path.is_file():
        raise SystemExit(f"Excel file not found: {excel_path}")

    sheet_name = cfg.get("sheet_name", "Master List Format")
    first_data_row = int(cfg.get("first_data_row", 2))
    collection_name = cfg.get("firestore_collection", "members")

    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    try:
        try:
            ws = wb[sheet_name]
        except KeyError as e:
            raise SystemExit(f"Sheet not found: {sheet_name!r}") from e

        rows_iter = ws.iter_rows(
            min_row=first_data_row,
            max_col=len(FIELD_NAMES),
            values_only=True,
        )

        batch = db.batch() if db is not None else None
        count = 0
        batch_size = 0
        max_batch = 450

        for row in rows_iter:
            if not row or all(v is None for v in row):
                continue
            member = row_to_member(tuple(row))
            mnum = member.get("membershipNumber")
            if mnum is None:
                continue
            member["sourceExcelPath"] = str(excel_path)
            if dry_run:
                count += 1
                continue
            assert db is not None and batch is not None
            doc_id = str(mnum)
            ref = db.collection(collection_name).document(doc_id)
            member["importedAt"] = firestore.SERVER_TIMESTAMP
            batch.set(ref, member, merge=True)
            batch_size += 1
            count += 1
            if batch_size >= max_batch:
                batch.commit()
                batch = db.batch()
                batch_size = 0

        if not dry_run and batch_size and batch is not None:
            batch.commit()
    finally:
        wb.close()

    print(f"Processed {count} rows into '{collection_name}' (dry_run={dry_run}).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Excel members to Firestore")
    parser.add_argument(
        "--config",
        type=Path,
        default=ROOT / "config" / "import.json",
        help="Path to import JSON (default: config/import.json)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Parse only; do not write")
    args = parser.parse_args()

    if not args.config.is_file():
        raise SystemExit(
            f"Config not found: {args.config}\nCopy config/import.example.json to config/import.json."
        )

    cfg = load_config(args.config)
    db = init_firebase() if not args.dry_run else None
    import_excel(cfg, db, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
