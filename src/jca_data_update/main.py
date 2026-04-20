"""Entry point for the JCA data update CLI."""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description="JCA data update")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would run without making changes",
    )
    args = parser.parse_args()
    if args.dry_run:
        print("Dry run: no changes made.")
    else:
        print("JCA_Data_Update: add your update logic here.")


if __name__ == "__main__":
    main()
