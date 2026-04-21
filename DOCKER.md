# Docker deployment guide

This project ships two independent containers so it can be installed and run
anywhere that has Docker + Docker Compose:

| Service   | What it does                                          | Image tag                  |
| --------- | ----------------------------------------------------- | -------------------------- |
| `web`     | Serves the React/Vite member-update SPA over nginx    | `jca-members-web:latest`   |
| `scripts` | Python CLI for Excel <-> Firestore import / export    | `jca-members-scripts:latest` |

Both containers talk to the same Firebase / Firestore project; only the
credentials change.

---

## 1. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows,
  macOS) **or** Docker Engine + Compose plugin on Linux.
- A Firebase project with Firestore enabled.
- The Firebase **Web SDK config** (public) - 6 values.
- A Firebase **service account JSON** (private) for the Python CLI.

---

## 2. One-time setup

```bash
# from the repo root
cp .env.example .env
# then edit .env and fill in the VITE_FIREBASE_* values

# drop your Firebase admin key next to the repo (git-ignored)
cp /path/to/your-serviceAccount.json ./serviceAccount.json

# folder for script outputs / Excel exchange
mkdir -p data
```

---

## 3. Run the web app

```bash
docker compose up -d --build web
```

Open <http://localhost:8080>. Change the host port with `WEB_PORT=9000 docker compose up -d web`.

To update the deployed site:

```bash
git pull
docker compose build web
docker compose up -d web
```

### Standalone (without compose)

```bash
docker build -t jca-members-web \
  --build-arg VITE_FIREBASE_API_KEY=xxx \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=xxx \
  --build-arg VITE_FIREBASE_PROJECT_ID=xxx \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET=xxx \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=xxx \
  --build-arg VITE_FIREBASE_APP_ID=xxx \
  ./web

docker run -d -p 8080:80 --name jca-members-web jca-members-web
```

---

## 4. Run the Python CLI (import / export)

The `scripts` service is in the `cli` profile so it doesn't start with
`docker compose up`; use `docker compose run` instead.

### Export `member_changes` to Excel

```bash
docker compose run --rm scripts \
  python scripts/export_member_changes.py \
  --output /app/data/Modified_And_New_Members.xlsx
```

The generated file appears in `./data/Modified_And_New_Members.xlsx` on your host.

### Import Excel into the `members` collection

```bash
# Put your Excel in ./data first, then:
docker compose run --rm scripts \
  python scripts/import_members_firestore.py \
  --excel /app/data/Master_List_Format_1500_Records.xlsx \
  --sheet "Master List Format" \
  --collection members
```

Adjust flags to match your script's CLI.

### Regenerate the QR code

```bash
docker compose run --rm scripts \
  python scripts/generate_qr.py \
  --url https://your-host.example.com \
  --output /app/data/JCA_Members_QR.png
```

---

## 5. Production notes

- **TLS / custom domain** - run `web` behind a reverse proxy (Caddy, nginx,
  Traefik, Cloudflare Tunnel). Point it at port `8080` (or your chosen
  `WEB_PORT`).
- **Secrets** - `serviceAccount.json` is mounted read-only and never baked
  into the image. The `VITE_FIREBASE_*` web config values are public by design
  (they're the same ones shipped to every browser by the Firebase Web SDK);
  Firestore security is enforced by `firestore.rules`.
- **Scaling** - the `web` image is a plain static-file nginx, so any number
  of instances can run behind a load balancer. Firestore handles concurrency
  server-side.
- **Updating Firestore rules** - rules are deployed from the host machine
  with the Firebase CLI; they're not part of either container.

---

## 6. Troubleshooting

| Symptom                                        | Fix                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `Missing Firebase env var` in the browser      | Rebuild the web image after editing `.env` (the values are baked at build time). |
| `DefaultCredentialsError` in the CLI container | Confirm `./serviceAccount.json` exists and is mounted read-only.    |
| Port 8080 already in use                       | `WEB_PORT=9090 docker compose up -d web`                            |
| Want a one-shot container, not compose         | Use the `docker run` example in section 3.                          |
