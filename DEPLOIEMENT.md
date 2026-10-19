# Mise en ligne sur le VPS OVH

Le site est maintenant une petite application **Node.js** : elle sert les pages **et** gère les comptes clients,
les avis, les devis et l'espace administrateur (base SQLite dans `data/lh.db`).

## 1. Préparer le serveur (une seule fois)
```bash
# Node.js 20 ou 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

## 2. Installer le site
```bash
cd /var/www
sudo git clone -b claude/compassionate-heisenberg-f79s5r https://github.com/Aaron59330/SiteWebLHrenovation.git lhrenovation
sudo chown -R $USER lhrenovation && cd lhrenovation
npm install --omit=dev
cp .env.example .env && chmod 600 .env && nano .env
```
Dans `.env`, renseignez au minimum :
- `SITE_URL` : `https://votre-domaine.fr`
- `JWT_SECRET` : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` : **vos** identifiants administrateur (mot de passe long et unique)
- `SMTP_PASS` : mot de passe d'application Gmail (compte Google > Sécurité > Validation en 2 étapes > Mots de passe des applications)

## 3. Lancer et garder actif
```bash
pm2 start server/server.js --name lhrenovation
pm2 save && pm2 startup     # démarrage automatique après un redémarrage
```

## 4. Nginx (reverse proxy) + HTTPS
`/etc/nginx/sites-available/lhrenovation` :
```nginx
server {
    server_name votre-domaine.fr www.votre-domaine.fr;
    client_max_body_size 1m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/lhrenovation /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d votre-domaine.fr -d www.votre-domaine.fr
```
(Si votre ancien site statique était servi par nginx/Apache sur ce domaine, remplacez simplement son `root` par ce `proxy_pass`.)

## 5. Utilisation
- **Espace admin** : `https://votre-domaine.fr/admin.html` (aucun lien public, protégé par votre e-mail + mot de passe).
  Onglets : *Demandes de devis* (marquer traité / supprimer), *Avis* (publier / refuser), *Clients*.
- Chaque devis et chaque avis vous arrive aussi **par e-mail** à `NOTIFY_TO`.
- Les avis envoyés par les clients ne sont publiés qu'**après votre validation**.

## Mise à jour / sauvegarde
```bash
cd /var/www/lhrenovation && git pull && npm install --omit=dev && pm2 restart lhrenovation
cp data/lh.db ~/sauvegarde-lh-$(date +%F).db     # à faire régulièrement
```
