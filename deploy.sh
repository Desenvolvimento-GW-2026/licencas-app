#!/bin/bash
set -e

# Run on Oracle Cloud VM (Ubuntu 22.04 ARM)
# Usage: bash deploy.sh
# Set REPO_URL before running, e.g.:
#   REPO_URL=https://github.com/youruser/licencas-app.git bash deploy.sh

DOMAIN="licencas.desenvolvimentogw.com.br"
EMAIL="bruce@generalwater.com.br"
APP_DIR="$HOME/licencas-app"
REPO_URL="${REPO_URL:-https://github.com/Desenvolvimento-GW-2026/licencas-app.git}"

# ── Docker ────────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "=== Installing Docker ==="
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "Docker installed. Log out and back in, then re-run this script."
  exit 0
fi

# ── Repo ──────────────────────────────────────────────────────────────────────
echo "=== Cloning / Updating repo ==="
if [ -d "$APP_DIR" ]; then
  git -C "$APP_DIR" pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "=== Creating .env ==="
  cp .env.example .env
  SECRET=$(openssl rand -base64 32)
  sed -i "s|generate-with-openssl-rand-base64-32|$SECRET|g" .env

  echo ""
  echo "Fill in these values in .env before continuing:"
  echo "  AMBISIS_EMAIL      — email de acesso ao AMBISIS"
  echo "  AMBISIS_PASSWORD   — senha do AMBISIS"
  echo "  ADMIN_EMAIL        — email do admin do painel"
  echo "  ADMIN_PASSWORD     — senha do admin do painel"
  echo ""
  echo "Edit .env then re-run: bash deploy.sh"
  exit 0
fi

# Validate required vars
source .env
for var in NEXTAUTH_SECRET AMBISIS_EMAIL AMBISIS_PASSWORD ADMIN_EMAIL ADMIN_PASSWORD; do
  if [ -z "${!var}" ]; then
    echo "Error: $var not set in .env"
    exit 1
  fi
done

# ── SSL Certificate (first run only) ─────────────────────────────────────────
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if [ ! -f "$CERT_PATH" ]; then
  echo "=== Obtaining SSL certificate (certbot standalone) ==="
  # Use certbot standalone — no nginx needed, port 80 must be free
  docker run --rm \
    -v certbot_conf:/etc/letsencrypt \
    -p 80:80 \
    certbot/certbot certonly --standalone \
    --email "$EMAIL" --agree-tos --no-eff-email \
    -d "$DOMAIN"
fi

# ── Start services ────────────────────────────────────────────────────────────
echo "=== Building and starting services ==="
docker compose up -d --build

# ── DB migration + seed ───────────────────────────────────────────────────────
echo "=== Running DB migration ==="
docker compose exec app npx prisma migrate deploy

echo "=== Seeding admin user ==="
docker compose exec app npx tsx prisma/seed.ts

echo ""
echo "Done! https://$DOMAIN"
