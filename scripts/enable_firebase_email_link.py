"""Attempt to enable Identity email sign-in via the Identity Platform Admin API.

**Spark (free) Firebase projects:** the Identity Toolkit v2 `projects/*/config`
API often has no config resource (`CONFIGURATION_NOT_FOUND`), and
`identityPlatform:initializeAuth` may require **Blaze billing**. In that case you
**must** turn on Email/Password + Email link in the Firebase **Console** (browser).

**Blaze / Identity Platform projects:** this script can PATCH `signIn.email` if GET
`admin/v2/projects/.../config` succeeds.

Usage (from project root):
  python scripts/enable_firebase_email_link.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

ROOT = Path(__file__).resolve().parents[1]
SA_PATH = ROOT / "serviceAccount.json"
FIREBASERC = ROOT / ".firebaserc"
SCOPES = ("https://www.googleapis.com/auth/cloud-platform",)
BASE = "https://identitytoolkit.googleapis.com/admin/v2"


def _project_id() -> str:
    data = json.loads(FIREBASERC.read_text(encoding="utf-8"))
    return str(data["projects"]["default"])


def _access_token() -> str:
    if not SA_PATH.is_file():
        print(f"Missing {SA_PATH}", file=sys.stderr)
        sys.exit(1)
    creds = service_account.Credentials.from_service_account_file(
        str(SA_PATH),
        scopes=SCOPES,
    )
    creds.refresh(Request())
    if not creds.token:
        print("Failed to obtain access token.", file=sys.stderr)
        sys.exit(1)
    return creds.token


def main() -> None:
    project_id = _project_id()
    name = f"projects/{project_id}/config"
    url = f"{BASE}/{name}"
    headers = {
        "Authorization": f"Bearer {_access_token()}",
        "Content-Type": "application/json",
    }

    r = requests.get(url, headers=headers, timeout=60)
    if r.status_code != 200:
        print(f"GET config failed: {r.status_code}\n{r.text}", file=sys.stderr)
        sys.exit(1)
    before = r.json()
    sign_in = before.get("signIn") or {}
    print("Current signIn.email:", json.dumps(sign_in.get("email"), indent=2))
    print("authorizedDomains (first 8):", (before.get("authorizedDomains") or [])[:8])

    # passwordRequired=false: user may sign in with email link (or email/password) per GCP SignInConfig.Email
    body = {
        "name": name,
        "signIn": {
            "email": {
                "enabled": True,
                "passwordRequired": False,
            },
        },
    }
    r2 = requests.patch(
        url,
        headers=headers,
        params={"updateMask": "signIn.email"},
        data=json.dumps(body),
        timeout=60,
    )
    if r2.status_code not in (200, 201):
        print(f"PATCH config failed: {r2.status_code}\n{r2.text}", file=sys.stderr)
        sys.exit(1)
    after = r2.json()
    print("Updated signIn.email:", json.dumps((after.get("signIn") or {}).get("email"), indent=2))
    print("Email sign-in is enabled with passwordless (email link) allowed.")


if __name__ == "__main__":
    main()
