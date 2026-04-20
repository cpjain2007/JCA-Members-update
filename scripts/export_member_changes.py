"""Export changed/new members from Firestore `member_changes` to an Excel file.

Usage:
  pip install -e ".[import]"
  python scripts/export_member_changes.py
  python scripts/export_member_changes.py --output "changed_members.xlsx"
"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from import_members_firestore import ROOT, init_firebase

try:
    import openpyxl
except ImportError as e:
    print('Missing dependency. Install with: pip install -e ".[import]"')
    raise SystemExit(1) from e

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

EXPORT_HEADERS = FIELD_NAMES + ["changeType", "changedAt", "changedByDeviceId"]


def serialize_value(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    return value


def export_changes(output_path: Path) -> int:
    db = init_firebase()
    docs = list(db.collection("member_changes").stream())

    rows = []
    for d in docs:
        data = d.to_dict() or {}
        row = [serialize_value(data.get(col)) for col in FIELD_NAMES]
        row.extend(
            [
                serialize_value(data.get("changeType")),
                serialize_value(data.get("changedAt")),
                serialize_value(data.get("changedByDeviceId")),
            ]
        )
        rows.append(row)

    rows.sort(key=lambda r: (r[5] is None, r[5]))  # membershipNumber is column index 5

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Modified and New Members"
    ws.append(EXPORT_HEADERS)
    for row in rows:
        ws.append(row)

    wb.save(output_path)
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export Firestore member_changes collection to an Excel file"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "Modified_And_New_Members.xlsx",
        help="Output XLSX path (default: Modified_And_New_Members.xlsx)",
    )
    args = parser.parse_args()

    count = export_changes(args.output.expanduser())
    print(f"Exported {count} changed/new members to: {args.output}")


if __name__ == "__main__":
    main()

