# Wedding Memories

QR on each table -> guests open one page to capture photos/videos, leave a voice memory, write a note, and browse/like/download the shared album. You manage everything at `/admin`.

## Run
```bash
cp .env.example .env     # edit PUBLIC_URL, names, ADMIN_PASSWORD
docker compose up -d --build
```
(Upgrading from v1? Keep the same `photos` volume; old uploads are adopted automatically.)

## Pages
- `/` guest app: Home, Album (stories, filters, likes, downloads), Capture, Voice, Note
- `/admin` (basic auth): gallery of everything incl. **HEIC** (shown as JPEG, original downloadable), delete, **Download all (.zip)**, print table QR card, upload cover photo

## HEIC
iPhone HEIC files are stored untouched. Browsers that can't show HEIC get an automatically generated JPEG (cached in `/data/cache`) for thumbnails, preview and guest downloads. Admin "⬇" and the zip always give the original file.

## Reverse proxy
Use HTTPS (required for camera/mic). Raise limits: nginx `client_max_body_size 200m; proxy_request_buffering off;`. Cloudflare free plan caps requests at 100 MB.

## Data
Everything is in the `photos` volume: `/data/uploads` (files), `/data/meta.json` (names, likes, notes), `/data/cache`, `/data/hero.jpg`.
Back up: `docker run --rm -v photos:/d -v $PWD:/b alpine tar czf /b/photos.tgz -C /d .`
