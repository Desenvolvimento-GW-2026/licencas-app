#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════════════════════
# Oracle Cloud Free Tier — First-Time Setup
# Ubuntu 22.04 ARM (Ampere A1)
#
# Usage (run as ubuntu or opc user):
#   curl -fsSL https://raw.githubusercontent.com/generalwater/licencas-app/master/setup-oracle.sh | bash
#   OR
#   bash setup-oracle.sh
# ═══════════════════════════════════════════════════════════════════════════════

DOMAIN="licencas.desenvolvimentogw.com.br"
EMAIL="bruce@generalwater.com.br"
APP_DIR="$HOME/licencas-app"
REPO_URL="${REPO_URL:-https://github.com/Desenvolvimento-GW-2026/licencas-app.git}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  AMBISIS License Monitor — Oracle Cloud Setup        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── System packages ───────────────────────────────────────────────────────────
echo "▸ Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq git curl openssl ufw

# ── Firewall ──────────────────────────────────────────────────────────────────
echo "▸ Configuring firewall..."
sudo ufw allow 22/tcp   comment "SSH"
sudo ufw allow 80/tcp   comment "HTTP"
sudo ufw allow 443/tcp  comment "HTTPS"
sudo ufw --force enable

# Oracle Cloud also requires opening ports in the VCN Security List.
# Go to: OCI Console → Networking → VCNs → your VCN → Security Lists
# Add Ingress rules: TCP 80 and TCP 443 from 0.0.0.0/0

# ── Docker ────────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "▸ Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo ""
  echo "Docker installed. You need to log out and back in for docker group to apply."
  echo "Then re-run: bash setup-oracle.sh"
  exit 0
fi

# ── Repo ──────────────────────────────────────────────────────────────────────
echo "▸ Cloning repository..."
if [ -d "$APP_DIR" ]; then
  git -C "$APP_DIR" pull --quiet
else
  git clone --quiet "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo ""
  echo "▸ Creating .env — please fill in the values below:"
  cp .env.example .env

  # Auto-generate NEXTAUTH_SECRET
  SECRET=$(openssl rand -base64 32)
  sed -i "s|generate-with-openssl-rand-base64-32|$SECRET|g" .env

  echo ""
  read -r -p "  AMBISIS_EMAIL (login do AMBISIS): " AMBISIS_EMAIL_VAL
  read -r -s -p "  AMBISIS_PASSWORD: " AMBISIS_PASSWORD_VAL
  echo ""
  read -r -p "  ADMIN_EMAIL (login do painel): " ADMIN_EMAIL_VAL
  read -r -s -p "  ADMIN_PASSWORD (senha do painel): " ADMIN_PASSWORD_VAL
  echo ""

  sed -i "s|AMBISIS_EMAIL=.*|AMBISIS_EMAIL=$AMBISIS_EMAIL_VAL|g" .env
  sed -i "s|AMBISIS_PASSWORD=.*|AMBISIS_PASSWORD=$AMBISIS_PASSWORD_VAL|g" .env
  sed -i "s|ADMIN_EMAIL=.*|ADMIN_EMAIL=$ADMIN_EMAIL_VAL|g" .env
  sed -i "s|ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$ADMIN_PASSWORD_VAL|g" .env

  echo "▸ .env created."
fi

# Validate required vars
set -a; source .env; set +a
for var in NEXTAUTH_SECRET AMBISIS_EMAIL AMBISIS_PASSWORD ADMIN_EMAIL ADMIN_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "Error: $var not set in .env — edit .env and re-run."
    exit 1
  fi
done

# ── DNS check ─────────────────────────────────────────────────────────────────
echo ""
echo "▸ Checking DNS for $DOMAIN..."
RESOLVED=$(dig +short "$DOMAIN" 2>/dev/null | tail -1 || true)
MY_IP=$(curl -s ifconfig.me 2>/dev/null || true)
if [ -z "$RESOLVED" ]; then
  echo ""
  echo "  WARNING: $DOMAIN does not resolve yet."
  echo "  Point an A record to this server's IP: $MY_IP"
  echo "  Then re-run this script."
  read -r -p "  Continue anyway? [y/N] " CONTINUE
  [ "$CONTINUE" != "y" ] && exit 1
elif [ "$RESOLVED" != "$MY_IP" ]; then
  echo "  WARNING: $DOMAIN resolves to $RESOLVED but this server is $MY_IP"
  echo "  SSL certificate will fail. Update DNS first."
  read -r -p "  Continue anyway? [y/N] " CONTINUE
  [ "$CONTINUE" != "y" ] && exit 1
else
  echo "  DNS OK ($DOMAIN → $MY_IP)"
fi

# ── SSL Certificate ───────────────────────────────────────────────────────────
CERT_LIVE="/var/lib/docker/volumes/${PWD##*/}_certbot_conf/_data/live/$DOMAIN/fullchain.pem"
if [ ! -f "$CERT_LIVE" ]; then
  echo ""
  echo "▸ Obtaining SSL certificate (port 80 must be free)..."
  docker run --rm \
    -v "${PWD##*/}_certbot_conf:/etc/letsencrypt" \
    -p 80:80 \
    certbot/certbot certonly --standalone \
    --email "$EMAIL" --agree-tos --no-eff-email \
    -d "$DOMAIN"
  echo "  Certificate obtained."
else
  echo "▸ SSL certificate already exists — skipping."
fi

# ── Start services ────────────────────────────────────────────────────────────
echo ""
echo "▸ Building and starting services..."
docker compose up -d --build

echo "▸ Waiting for app container to be ready..."
sleep 10

# ── DB setup ──────────────────────────────────────────────────────────────────
echo "▸ Running database migration..."
docker compose exec app npx prisma migrate deploy

echo "▸ Seeding admin user..."
docker compose exec app npx tsx prisma/seed.ts

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Setup complete!                                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  URL:   https://$DOMAIN"
echo "  Login: use the ADMIN_EMAIL and ADMIN_PASSWORD you set above"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f app        — app logs"
echo "    docker compose logs -f scheduler  — scraper logs"
echo "    docker compose restart app        — restart app"
echo "    git pull && docker compose up -d --build  — update"
