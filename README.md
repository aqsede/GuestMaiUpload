# Wedding Photo Share

Guests scan a QR code on their table, tap one button, and their photos/videos upload straight to your server. No app, no login.

## Run
```bash
cp .env.example .env     # edit PUBLIC_URL, title, ADMIN_PASSWORD
docker compose up -d --build
```
Or without compose:
```bash
docker build -t wedding-photos .
docker run -d --name wedding-photos --env-file .env -p 3000:3000 -v photos:/data --restart unless-stopped wedding-photos
```

## URLs
- `/` guest upload page (what the QR opens)
- `/admin` login with ADMIN_USER / ADMIN_PASSWORD: gallery, delete, **Download all (.zip)**, **Print table card** (QR + title)

## Reverse proxy (important)
Serve over **HTTPS** (phones need it for a good experience) and raise upload limits:
- nginx: `client_max_body_size 200m;` and `proxy_request_buffering off;`
- Caddy: works out of the box. 
- Cloudflare proxy (free plan) caps a single request at 100 MB, so keep MAX_MB <= 100.

## Notes
- Files live in the `photos` Docker volume (`/data/uploads`). Back it up: `docker run --rm -v photos:/d -v $PWD:/b alpine tar czf /b/photos.tgz -C /d .`
- Only image/* and video/* are accepted. Each file uploads as its own request with one auto-retry, 3 in parallel.
- Anyone with the QR link can upload, so test the QR before printing, and print the card from `/admin`.
- Videos from phones can be large; raise MAX_MB if you expect long clips.
