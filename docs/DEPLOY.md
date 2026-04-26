# Deployment-Anleitung — PortePortal

## 🚀 Schnellstart: GitHub Pages (empfohlen für interne Nutzung)

### Voraussetzungen
- GitHub-Account
- Git installiert
- Optional: eigene Domain

### Schritt-für-Schritt

#### 1. Lokale Vorbereitung

```bash
cd PortePortal
git init
git add .
git commit -m "Initial commit: PortePortal v1.0 - Genius Toolset Tiefbau"
```

#### 2. GitHub-Repo erstellen

1. Auf [github.com](https://github.com/new) gehen
2. Repository-Name: `PortePortal`
3. **Private** auswählen (für interne Nutzung)
4. *Nicht* "Add README" / "Add .gitignore" / "Add license" anhaken (haben wir schon)
5. **Create repository** klicken

#### 3. Lokales Repo verbinden und pushen

```bash
git branch -M main
git remote add origin git@github.com:DEIN-USER/PortePortal.git
git push -u origin main
```

#### 4. GitHub Pages aktivieren

1. Im Repo: **Settings** → **Pages**
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` / Folder: `/ (root)`
4. **Save**

Nach 1–2 Min. ist die Seite live unter:
```
https://DEIN-USER.github.io/PortePortal/
```

---

## 🌐 Eigene Domain (Custom Domain)

### Beispiel: `portal.union-e.de`

#### 1. CNAME-Datei im Repo

```bash
echo "portal.union-e.de" > CNAME
git add CNAME
git commit -m "Add custom domain"
git push
```

#### 2. DNS konfigurieren

Beim DNS-Anbieter (z.B. Strato, IONOS, Cloudflare):

| Typ | Host | Ziel |
|-----|------|------|
| `CNAME` | `portal` | `DEIN-USER.github.io` |

> Bei Apex-Domain (`union-e.de` ohne Subdomain) stattdessen `A`-Records auf:
> ```
> 185.199.108.153
> 185.199.109.153
> 185.199.110.153
> 185.199.111.153
> ```

#### 3. In GitHub konfigurieren

1. **Settings → Pages**
2. **Custom domain**: `portal.union-e.de` eintragen → **Save**
3. Auf **Enforce HTTPS** warten (kann 24h dauern), dann anhaken

---

## 🐧 Deploy auf eigenem Server (Linux + Nginx)

### Voraussetzung
- Server mit Nginx oder Apache
- Domain mit SSL-Zertifikat (Let's Encrypt empfohlen)

### Nginx-Konfiguration

```nginx
server {
  listen 80;
  listen [::]:80;
  server_name portal.union-e.de;
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name portal.union-e.de;

  ssl_certificate /etc/letsencrypt/live/portal.union-e.de/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/portal.union-e.de/privkey.pem;

  root /var/www/porteportal;
  index index.html;

  # MIME types für PWA
  types {
    application/manifest+json webmanifest;
    image/png png;
    image/svg+xml svg;
  }

  # Service Worker — kein Cache, damit Updates greifen
  location = /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    expires off;
  }

  # Manifest — kurzes Cache
  location = /manifest.webmanifest {
    add_header Cache-Control "max-age=300";
  }

  # Statische Assets — langes Cache
  location ~* \.(?:png|jpg|jpeg|svg|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Standard
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Sicherheit
  add_header X-Content-Type-Options nosniff;
  add_header X-Frame-Options SAMEORIGIN;
  add_header Referrer-Policy no-referrer-when-downgrade;
}
```

### Dateien hochladen

```bash
# Lokal vom Repo:
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='docs' \
  ./ \
  user@server:/var/www/porteportal/

# Berechtigungen setzen
ssh user@server "sudo chown -R www-data:www-data /var/www/porteportal"
```

### Nginx neu laden

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 🧪 Lokales Testing

### Mit Python

```bash
cd PortePortal
python3 -m http.server 8080
```

Browser: [http://localhost:8080](http://localhost:8080)

### Mit Node.js

```bash
npx serve .
```

### Mit PHP

```bash
php -S localhost:8080
```

> **Wichtig**: Service Worker funktionieren nur über HTTPS oder `localhost`.

---

## 📱 PWA-Installation testen

### Auf iPhone/iPad (Safari)
1. Portal öffnen in Safari
2. **Teilen-Symbol** (Quadrat mit Pfeil) tippen
3. **Zum Home-Bildschirm** wählen
4. Bestätigen → App-Icon auf dem Home-Bildschirm

### Auf Android (Chrome)
1. Portal öffnen in Chrome
2. **3-Punkte-Menü** → **App installieren**
3. Bestätigen

### Auf Desktop (Chrome/Edge)
1. Portal öffnen
2. Adressleiste: **Install-Icon** klicken (rechts neben URL)
3. **Installieren**

---

## 🔄 Updates ausrollen

### 1. Code ändern

Datei bearbeiten, lokal mit `python3 -m http.server` testen.

### 2. Cache invalidieren

In `sw.js` die Version hochzählen:

```js
const CACHE_VERSION = 'porteportal-v1.0.1';  // war: v1.0.0
```

### 3. Deployen

```bash
git add .
git commit -m "Update: <Beschreibung>"
git push
```

GitHub Pages deployt automatisch nach 1–2 Min. Nutzer bekommen das Update beim nächsten Aufruf.

---

## 🔐 Zugriffsschutz (optional)

Bei sensiblen internen Daten:

### Option A: Private Repo + Cloudflare Access
- Repo privat lassen
- Hosting via Cloudflare Pages mit **Access**-Policy (z.B. nur Mitarbeiter mit `@union-e.de`-E-Mail)

### Option B: Nginx Basic Auth

```nginx
location / {
  auth_basic "Union E intern";
  auth_basic_user_file /etc/nginx/.htpasswd;
  try_files $uri $uri/ /index.html;
}
```

```bash
sudo htpasswd -c /etc/nginx/.htpasswd cgalka
```

### Option C: VPN-only
- Server nur im internen Netz / VPN exponieren

---

## ❓ Troubleshooting

### Service Worker wird nicht geladen
- HTTPS-only erforderlich (außer localhost)
- Browser-DevTools → Application → Service Workers → "Unregister" + Reload

### Manifest-Icon wird nicht angezeigt
- PNG-Größe prüfen (mind. 192×192, idealerweise 512×512)
- `purpose: "any maskable"` im Manifest

### Tools laden nicht offline
- Erstbesuch im Online-Modus nötig (für Cache-Fill)
- Cache-Version prüfen
- Tool-Pfade im `APP_SHELL`-Array von `sw.js` ergänzen, falls neue Tools dazukommen

---

*Bei Fragen: cgalka@union-e.de*
