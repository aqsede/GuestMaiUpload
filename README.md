# Wedding Memories

QR on each table -> guests open one page to capture photos/videos, leave a voice memory, write a note, and browse/like/download the shared album. You manage everything at `/admin`.

## Run
```bash
cp .env.example .env     # edit PUBLIC_URL, names, ADMIN_PASSWORD
docker compose up -d --build
```
(Upgrading from v1? Keep the same `photos` volume; old uploads are adopted automatically.)

## Pages
- `/` guest app. **Opens on the Album** (the QR lands here). The centre "Add yours" camera button ripples and a slim "Add your photos" card shows until that phone has added something (then both go quiet). Pages: Album (stories, filters, likes, downloads), Capture, Voice, Note, Home (welcome), and **?** = a tiny "How to" page with a 3-tap "Oops? Remove it" guide
- `/admin` (basic auth): gallery of everything incl. **HEIC** (shown as JPEG, original downloadable), delete, **Download all (.zip)**, print table QR card, upload cover photo

## Guests can delete their own uploads
Each phone/browser gets a random "device signature" (an HttpOnly cookie, set on first visit). Only a hash of it is stored next to each upload, so the device that uploaded a photo, video, voice memo or note can delete it (tap the item in the Album, then **Delete**; the **Mine** chip lists just theirs, and their tiles carry a small "Mine" badge). Tiles stay uncluttered: tap any tile for the full-screen view with Save / Delete / Change moment. The little ▦ switch above the grid toggles large (2 columns) and small (3 columns) tiles and nobody else can. You can still delete anything from `/admin`.
- Items uploaded before this version have no owner, so only `/admin` can delete them.
- Clearing browser data / switching browser or using a different phone means that device no longer owns its old uploads.
- With `ALBUM_PUBLIC=false`, guests still see (and can delete) their own uploads via `/api/mine`.

## Moments (stories) and tagging
Guests are never asked a question before uploading. Photos/videos upload the moment they are picked; a bottom sheet pops up straight away showing only that batch, with one-tap emoji buttons to tag the whole batch (tap again to un-select; files already uploaded are updated, queued ones use the new tag). Skipping keeps "Anywhere"; once everything is uploaded and tagged the sheet closes by itself. Tapping **+** on a story in the Album pre-selects that moment. A guest can change the moment of one of their own photos/videos later from its full-screen view (Album → Mine). In the Album, **Everything** is the first story tile and a "Showing … · Show all" bar appears whenever a moment is selected.

## Voice memories
Tap the mic → allow the microphone (a 3-2-1 countdown follows the first permission pop-up) → stop → listen → **Send** or **Record again**. If the mic is blocked or unsupported (e.g. in-app browsers), guests get step-by-step help and can choose an audio file instead.

## HEIC
iPhone HEIC files are stored untouched. Browsers that can't show HEIC get an automatically generated JPEG (cached in `/data/cache`) for thumbnails, preview and guest downloads. Admin "⬇" and the zip always give the original file.

## Reverse proxy
Use HTTPS (required for camera/mic). Raise limits: nginx `client_max_body_size 200m; proxy_request_buffering off;`. Cloudflare free plan caps requests at 100 MB.

## Data
Everything is in the `photos` volume: `/data/uploads` (files), `/data/meta.json` (names, likes, notes), `/data/cache`, `/data/hero.jpg`.
Back up: `docker run --rm -v photos:/d -v $PWD:/b alpine tar czf /b/photos.tgz -C /d .`
