#!/usr/bin/env bash
# Installation sécurisée du site L.H Rénovation sur un serveur Ubuntu 24.04 NEUF.
# À lancer depuis le dossier du site, avec l'utilisateur normal (ubuntu), en étant connecté PAR CLÉ SSH :
#     bash scripts/installer-serveur.sh
set -euo pipefail

BRANCH="claude/compassionate-heisenberg-f79s5r"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_ARCHIVE="$HOME/lh-data.tgz"

say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERREUR : %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Ne lancez pas ce script en root : utilisez l'utilisateur ubuntu (il demandera sudo si besoin)."
[ -f "$APP_DIR/server/server.js" ] || die "Lancez-le depuis le dossier du site (celui qui contient server/ et public/)."
[ -s "$HOME/.ssh/authorized_keys" ] || die "Aucune clé SSH trouvée dans ~/.ssh/authorized_keys : ajoutez votre clé avant de continuer (sinon vous seriez enfermé dehors)."

say "Questions"
read -rp "Nom de domaine [lhrenovation.pro] : " DOMAIN; DOMAIN="${DOMAIN:-lhrenovation.pro}"
read -rp "E-mail administrateur [lhrenovation.int@gmail.com] : " ADMIN_EMAIL; ADMIN_EMAIL="${ADMIN_EMAIL:-lhrenovation.int@gmail.com}"
while :; do
  read -rsp "NOUVEAU mot de passe administrateur du site (12 caractères minimum) : " ADMIN_PASSWORD; echo
  read -rsp "Confirmez-le : " P2; echo
  [ "$ADMIN_PASSWORD" = "$P2" ] || { echo "Les deux saisies sont différentes."; continue; }
  [ "${#ADMIN_PASSWORD}" -ge 12 ] || { echo "Trop court (12 minimum)."; continue; }
  case "$ADMIN_PASSWORD" in *\"*|*\\*|*\'*) echo "Évitez les caractères \" ' et \\ dans ce mot de passe."; continue;; esac
  break
done
read -rsp "Mot de passe d'application Gmail pour l'envoi des e-mails (Entrée pour passer) : " SMTP_PASS; echo
SMTP_PASS="${SMTP_PASS// /}"

say "1/8 Mises à jour du système et outils"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl git ufw fail2ban unattended-upgrades nginx certbot python3-certbot-nginx build-essential ca-certificates

say "2/8 Node.js 22 et pm2"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2

say "3/8 Pare-feu et protection contre les tentatives de piratage"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo systemctl enable --now fail2ban
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

say "4/8 Installation du site"
cd "$APP_DIR"
git fetch -q origin "$BRANCH" && git checkout -q "$BRANCH" && git pull -q origin "$BRANCH" || true
npm install --omit=dev --no-audit --no-fund

say "5/8 Configuration (.env)"
JWT="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
umask 077
cat > "$APP_DIR/.env" <<ENV
PORT=3000
NODE_ENV=production
SITE_URL=https://$DOMAIN
JWT_SECRET=$JWT
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD="$ADMIN_PASSWORD"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=$ADMIN_EMAIL
SMTP_PASS=$SMTP_PASS
NOTIFY_TO=$ADMIN_EMAIL
ENV
chmod 600 "$APP_DIR/.env"
umask 022

say "6/8 Restauration de vos données (si l'archive est présente)"
mkdir -p "$APP_DIR/data/uploads"
if [ -f "$DATA_ARCHIVE" ]; then
  TMP="$(mktemp -d)"
  tar xzf "$DATA_ARCHIVE" -C "$TMP" --no-same-owner --no-same-permissions
  for f in lh.db lh.db-wal lh.db-shm; do [ -f "$TMP/data/$f" ] && cp "$TMP/data/$f" "$APP_DIR/data/$f"; done
  # seules les images portant un nom généré par le site sont reprises (aucun autre type de fichier)
  find "$TMP/data/uploads" -type f -regextype posix-extended -regex '.*/[a-f0-9]{32}\.(jpg|png|webp)' -exec cp {} "$APP_DIR/data/uploads/" \; 2>/dev/null || true
  rm -rf "$TMP"
  echo "Données restaurées : $(ls "$APP_DIR/data/uploads" | wc -l) photo(s)."
else
  echo "Aucune archive $DATA_ARCHIVE : démarrage avec une base vide."
fi

say "7/8 Démarrage du site (et redémarrage automatique)"
pm2 delete lhrenovation >/dev/null 2>&1 || true
pm2 start server/server.js --name lhrenovation
pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null
pm2 save
sleep 3
curl -fsS http://127.0.0.1:3000/api/me >/dev/null || die "Le site ne répond pas : regardez 'pm2 logs lhrenovation'."

say "8/8 nginx et HTTPS"
sudo tee /etc/nginx/sites-available/lhrenovation >/dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/lhrenovation /etc/nginx/sites-enabled/lhrenovation
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
if ! sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --agree-tos -m "$ADMIN_EMAIL" --redirect --non-interactive; then
  echo "Essai sans le www…"
  sudo certbot --nginx -d "$DOMAIN" --agree-tos -m "$ADMIN_EMAIL" --redirect --non-interactive || echo "HTTPS non activé : vérifiez que le domaine pointe bien vers ce serveur, puis relancez la commande certbot."
fi

say "Sécurisation de SSH (mot de passe désactivé, clé obligatoire)"
echo "PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no" | sudo tee /etc/ssh/sshd_config.d/00-lh-hardening.conf >/dev/null
sudo sshd -t && sudo systemctl restart ssh
sudo sshd -T | grep -Ei '^(passwordauthentication|permitrootlogin)'

cat <<DONE

\033[1;32mTERMINÉ.\033[0m
 - Site : https://$DOMAIN        - Administration : connectez-vous via « Mon compte » avec $ADMIN_EMAIL
 - NE FERMEZ PAS cette fenêtre : ouvrez un 2e PowerShell et vérifiez que « ssh ubuntu@<ip> » fonctionne encore avec votre clé.
 - Redémarrage automatique : testez avec « sudo reboot », puis « pm2 status » 2 minutes après.
DONE
