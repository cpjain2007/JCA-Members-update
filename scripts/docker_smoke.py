"""Offline smoke-check of the Docker assets without needing Docker installed.

Runs three passes:
  1. Parse docker-compose.yml and report services / build args.
  2. Lint Dockerfiles for valid instructions, stages, and obvious issues.
  3. Verify nginx.conf is a valid-looking nginx server block.
"""

from __future__ import annotations

import pathlib
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent

VALID_DOCKERFILE_INSTRUCTIONS = {
    "FROM", "RUN", "CMD", "ENTRYPOINT", "COPY", "ADD", "ENV", "ARG",
    "EXPOSE", "WORKDIR", "USER", "LABEL", "HEALTHCHECK", "VOLUME",
    "ONBUILD", "SHELL", "STOPSIGNAL", "MAINTAINER",
}


def check_compose(path: pathlib.Path) -> list[str]:
    issues: list[str] = []
    print(f"\n[1/3] docker-compose: {path.name}")
    try:
        with path.open("r", encoding="utf-8") as f:
            doc = yaml.safe_load(f)
    except yaml.YAMLError as e:
        return [f"YAML parse error: {e}"]

    services = doc.get("services") or {}
    if not services:
        return ["no services defined"]

    print(f"  services: {list(services.keys())}")
    for name, svc in services.items():
        build = svc.get("build")
        image = svc.get("image")
        ports = svc.get("ports", [])
        volumes = svc.get("volumes", [])
        print(f"  - {name}")
        if isinstance(build, dict):
            ctx = build.get("context")
            df = build.get("dockerfile", "Dockerfile")
            args = list((build.get("args") or {}).keys())
            print(f"      build context={ctx!r} dockerfile={df!r}")
            if args:
                print(f"      build args   ={args}")
            df_path = (ROOT / ctx / df).resolve()
            if not df_path.exists():
                issues.append(f"{name}: Dockerfile {df_path} not found")
            else:
                print(f"      dockerfile -> {df_path.relative_to(ROOT)}  OK")
        if image:
            print(f"      image={image}")
        if ports:
            print(f"      ports={ports}")
        if volumes:
            print(f"      volumes={volumes}")

    return issues


def check_dockerfile(path: pathlib.Path) -> list[str]:
    issues: list[str] = []
    print(f"\n  Dockerfile: {path.relative_to(ROOT)}")
    text = path.read_text(encoding="utf-8")

    # Merge line continuations ('\' at end of line)
    merged: list[str] = []
    buf = ""
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.endswith("\\"):
            buf += line[:-1]
            continue
        buf += line
        merged.append(buf)
        buf = ""
    if buf:
        merged.append(buf)

    stages: list[str] = []
    seen_from = False
    has_cmd_or_entrypoint = False

    for i, line in enumerate(merged, start=1):
        bare = line.strip()
        if not bare or bare.startswith("#"):
            continue
        # Skip parser directives (e.g. "# syntax=...") and the `ARG` before FROM
        instr = bare.split(None, 1)[0].upper()
        if instr not in VALID_DOCKERFILE_INSTRUCTIONS:
            issues.append(f"line {i}: unknown instruction {instr!r}")
            continue
        if instr == "FROM":
            seen_from = True
            stages.append(bare)
        if instr in ("CMD", "ENTRYPOINT"):
            has_cmd_or_entrypoint = True

    print(f"    stages: {len(stages)}")
    for s in stages:
        print(f"      {s}")
    if not seen_from:
        issues.append("no FROM instruction found")
    if not has_cmd_or_entrypoint:
        issues.append("no CMD or ENTRYPOINT — container will exit immediately")
    if not issues:
        print("    lint: OK")
    return issues


def check_nginx(path: pathlib.Path) -> list[str]:
    issues: list[str] = []
    print(f"\n[3/3] nginx.conf: {path.relative_to(ROOT)}")
    if not path.exists():
        return [f"missing {path}"]
    text = path.read_text(encoding="utf-8")
    if text.count("{") != text.count("}"):
        issues.append("unbalanced braces")
    for keyword in ("server", "listen", "root", "index", "try_files"):
        if keyword not in text:
            issues.append(f"missing expected keyword {keyword!r}")
    if not issues:
        print("  structure: OK")
    return issues


def main() -> int:
    all_issues: list[str] = []

    all_issues += check_compose(ROOT / "docker-compose.yml")

    print("\n[2/3] Dockerfiles")
    all_issues += check_dockerfile(ROOT / "Dockerfile")
    all_issues += check_dockerfile(ROOT / "web" / "Dockerfile")

    all_issues += check_nginx(ROOT / "web" / "nginx.conf")

    print("\n" + "=" * 60)
    if all_issues:
        print(f"FAILED — {len(all_issues)} issue(s):")
        for it in all_issues:
            print(f"  - {it}")
        return 1
    print("PASSED — all Docker assets look valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
