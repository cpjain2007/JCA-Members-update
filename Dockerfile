# syntax=docker/dockerfile:1.6

# -----------------------------------------------------------------------------
# Python CLI image for Excel <-> Firestore import/export helpers.
#
# Build once, then run any of the scripts by overriding the command:
#
#   docker build -t jca-scripts .
#   docker run --rm \
#     -v %cd%/serviceAccount.json:/app/serviceAccount.json:ro \
#     -v %cd%/data:/app/data \
#     -e GOOGLE_APPLICATION_CREDENTIALS=/app/serviceAccount.json \
#     jca-scripts python scripts/export_member_changes.py \
#       --output /app/data/Modified_And_New_Members.xlsx
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Minimal OS deps for building wheels
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        tini \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first for better layer caching
COPY pyproject.toml ./
RUN pip install --upgrade pip \
    && pip install "firebase-admin>=6.5.0" "openpyxl>=3.1.0" "qrcode[pil]>=7.4"

# Copy project source
COPY scripts ./scripts
COPY src ./src
COPY config ./config

# Create a data folder for Excel mounts / outputs
RUN mkdir -p /app/data

# Run as non-root
RUN useradd -m -u 10001 jca \
    && chown -R jca:jca /app
USER jca

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-c", "print('JCA scripts image. Override CMD, e.g. python scripts/export_member_changes.py')"]
