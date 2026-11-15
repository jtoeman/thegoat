# GOAT image ingest Worker (B20)

Deploy from this folder (keeps the INGEST_TOKEN secret already set):

    cd ingest-worker
    npx wrangler deploy

Check it: https://goat-image-ingest.jeremy-86d.workers.dev/health should show "build": "B20".

Routes:
- GET /catalog: categories and words from the sheet (used by the extension)
- GET /categories.txt: "id|Name" lines (used by the iPhone Shortcut)
- POST /ingest: JSON (source_url) or multipart (file upload). Needs the bearer token.

## B20: purge the CDN on replace
Two secrets, set once (they survive later deploys):

    npx wrangler secret put PURGE_TOKEN     # API token: Zone > Cache Purge > Purge, scoped to froobaloo.com
    npx wrangler secret put PURGE_ZONE_ID   # the froobaloo.com zone ID (Overview page, right-hand side)

Without them the Worker still saves images, and the response says "purged": false.
