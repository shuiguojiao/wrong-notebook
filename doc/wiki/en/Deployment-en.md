# Deployment and Upgrades

Build the image from source, or use `ghcr.io/shuiguojiao/wrong-notebook:latest` after this fork’s Docker workflow has published it. The workflow supports `linux/amd64` and `linux/arm64`. Check the fork’s container packages for available tags; upstream release tags do not imply images are available in this fork.

## Deploy with Docker Compose

Create a deployment directory:

```bash
mkdir -p wrong-notebook/data wrong-notebook/config
cd wrong-notebook
openssl rand -base64 32
```

Write the generated secret and the actual access URL to `.env` in this directory:

```dotenv
NEXTAUTH_SECRET=replace-with-the-generated-secret
NEXTAUTH_URL=http://localhost:3000
```

When the app is accessed from other devices, set `NEXTAUTH_URL` to the full URL actually used to open it.

Create `docker-compose.yml`:

```yaml
services:
  wrong-notebook:
    image: ghcr.io/shuiguojiao/wrong-notebook:latest
    container_name: wrong-notebook
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:?Set NEXTAUTH_SECRET in .env}
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3000}
      PRESERVE_EXISTING_DATA: "true"
    volumes:
      - ./data:/app/data
      - ./config:/app/config
```

Start and check the service:

```bash
docker compose up -d
docker compose ps
curl --fail http://localhost:3000/api/health
```

A fresh deployment has no default account; the startup log prints a one-time setup link:

```bash
docker compose logs wrong-notebook | grep initialize
```

Open the link in a browser (its host matches `NEXTAUTH_URL`), choose the admin email and password, and continue in the setup wizard. The link works only once; the token is also stored in `config/setup-token`.

A healthy endpoint returns `status: "ok"` together with `version` and `revision`. It queries the database but does not test the AI; sign in, test the connection in the AI settings, and recognize a real question as well.

For the default account of a fresh install, see [Quick Start](Quick-Start-en).

## Persistent directories

| Container directory | Contents | Handling |
| --- | --- | --- |
| `/app/data` | SQLite database and initialization marker | Mount persistently and back up regularly |
| `/app/config` | AI configuration, prompts and global settings saved from the web UI | Mount persistently; backups contain sensitive credentials |
| `/app/certs` | Certificates for the built-in HTTPS | Mount and back up when used |

The image sets `PRESERVE_EXISTING_DATA=true` by default. When an existing database is found, startup runs the formal migrations and skips admin seeding and system tag rebuilding, so existing accounts, tags and their links are kept.

## HTTPS and reverse proxies

For access by domain name, use an HTTPS certificate trusted by browsers. A reverse proxy can forward HTTPS requests to the app's HTTP port; set `NEXTAUTH_URL` to the external HTTPS address.

The reverse proxy should forward `X-Real-IP` or `X-Forwarded-For`, because failed sign-ins are counted per client IP. The app sends security headers such as `X-Frame-Options: SAMEORIGIN` by default, so pages on other domains cannot embed it in an iframe; configure HSTS on the reverse proxy if you need it.

The app also provides built-in HTTPS; see [`docker-compose.https.yml`](https://github.com/shuiguojiao/wrong-notebook/blob/main/docker-compose.https.yml) in the repository:

- Set `HTTPS_ENABLED=true`, `CERT_DOMAIN` and the correct `NEXTAUTH_URL`.
- Map container port `443` and mount the certificate directory at `/app/certs`.
- Custom certificates must be named `cert.pem` and `key.pem`; if they are missing, the startup script tries to generate a self-signed certificate.

Clients must be set up to trust a self-signed certificate. HTTPS is one of the requirements for screenshots, and mobile browsers may still not support `getDisplayMedia()`. See the [HTTPS setup guide](https://github.com/shuiguojiao/wrong-notebook/blob/main/doc/HTTPS_SETUP.md) for details.

## Upgrade

1. Note the current image version and back up `data/`, `config/` and the deployment configuration following the [full-site backup steps](Backup-and-Restore-en).
2. Change the image version in Compose, keeping the mounted directories and the session secret.
3. Run:

   ```bash
   docker compose pull
   docker compose up -d
   docker compose logs --tail=100 wrong-notebook
   curl --fail http://localhost:3000/api/health
   ```

4. Check the running version, then sign in and confirm that existing accounts, questions, tags and exam papers still work.

To roll back after an upgrade, stop the service, restore the data and configuration that match the old version from your backup, then start the old image. Once the database has been migrated, switching back to the old image alone may not be compatible.

## Build the image from source

```bash
git clone https://github.com/shuiguojiao/wrong-notebook.git
cd wrong-notebook
docker build -t wrong-notebook:local .
```

The Dockerfile runs Vitest, script syntax checks and the production build inside the image, and initializes the database used by fresh installs. Change `image` in Compose to `wrong-notebook:local` and run it with the same mounts as above.

## Local installer builds

Build installers with `scripts/package/`; see [INSTALL_PACKAGES.md](https://github.com/shuiguojiao/wrong-notebook/blob/main/doc/INSTALL_PACKAGES.md). This fork does not currently publish installers, npm packages or apps.
