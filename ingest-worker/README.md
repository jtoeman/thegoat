# GOAT image ingest Worker (B19)

Deploy from this folder (keeps the INGEST_TOKEN secret already set):

    cd ingest-worker
    npx wrangler deploy

Check it: https://goat-image-ingest.jeremy-86d.workers.dev/health should show "build": "B19".

Routes:
- GET /catalog: categories and words from the sheet (used by the extension)
- GET /categories.txt: "id|Name" lines (used by the iPhone Shortcut)
- POST /ingest: JSON (source_url) or multipart (file upload). Needs the bearer token.
