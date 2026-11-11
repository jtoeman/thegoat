/**
 * GOAT image ingest Worker, build B19.
 *
 * Routes:
 *   GET  /health            build number, no auth
 *   GET  /catalog           categories and their words from the GOAT sheet (JSON), no auth
 *   GET  /categories.txt    one line per category, "id|Display name" (used by the iPhone Shortcut), no auth
 *   POST /ingest            stores one image plus a JSON sidecar. Needs Authorization: Bearer <INGEST_TOKEN>
 *
 * POST /ingest accepts two bodies:
 *   JSON       { category, name, source_url (https), license, author, source_page, override }
 *   multipart  fields category, name, file (the image), plus optional license, author, source_page, override
 * slug is optional. When it is missing, the Worker uses the sheet's photo file name for that word,
 * or the name itself when the word is new.
 *
 * Stored as:
 *   <category>/<slug>.jpg    original image bytes
 *   <category>/<slug>.json   license, author, source page, title, ingest time
 *
 * Public URLs come from the R2 custom domain. Crops and resizes happen at delivery, so this Worker stores originals only.
 */

const BUILD = "B19";
const USER_AGENT = "GOAT-image-pipeline/B19 (The GOAT prototype; image ingest)";
const MAX_BYTES = 15 * 1024 * 1024;
const KEY_PART = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const SHEET_ID = "1FbM320qaloYDHZHRAvLfDiK-IeKeM4TUaQo_hve_KsU";
const INDEX_GID = 1558846279; // the "Categories" tab
const IMAGE_BASE = "https://images.froobaloo.com/";
const SHEET_TTL = 300; // seconds to cache each sheet tab at the edge

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

function text(body) {
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" } });
}

function isAuthorized(request, env) {
  const header = request.headers.get("authorization") || "";
  return env.INGEST_TOKEN && header === `Bearer ${env.INGEST_TOKEN}`;
}

/* ---------- sheet reading ---------- */

/* Minimal CSV reader: quoted fields, doubled quotes, CRLF or LF. Returns one object per row, keyed by lowercase header. */
function parseCSV(input) {
  const rows = [];
  let row = [], field = "", q = false;
  const s = input.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  return rows
    .filter(r => r.some(c => c.trim()))
    .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

async function sheetTab(gid) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`, {
    cf: { cacheTtl: SHEET_TTL, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`sheet tab ${gid} returned HTTP ${res.status}`);
  return res.text();
}

const idOf = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const photoSlug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* A word's slug is the file name in its photo column when that photo lives in this category's folder,
   so "Taylor Swift" with taylorswift.jpg in the sheet keeps taylorswift. */
function slugFor(word, category) {
  const prefix = IMAGE_BASE + category + "/";
  if (word.photo && word.photo.startsWith(prefix)) {
    const file = word.photo.slice(prefix.length).split("?")[0].replace(/\.jpg$/i, "");
    if (KEY_PART.test(file)) return file;
  }
  const guess = photoSlug(word.name);
  return KEY_PART.test(guess) ? guess : null;
}

async function buildCatalog() {
  const index = parseCSV(await sheetTab(INDEX_GID)).filter(r => r.category && r["tab id"]);
  const categories = [];
  const seen = new Set();
  for (const r of index) {
    const id = idOf(r.category);
    if (!id || id === "uncategorized" || seen.has(id)) continue;
    seen.add(id);
    let rows;
    try { rows = parseCSV(await sheetTab(r["tab id"])); } catch (e) { continue; }
    const names = new Set();
    const words = [];
    for (const w of rows) {
      if (!w.name || (w.on || "TRUE").toUpperCase() === "FALSE" || names.has(w.name)) continue;
      names.add(w.name);
      words.push({ name: w.name, slug: slugFor(w, id), photo: w.photo || null });
    }
    categories.push({ id, name: r["display name"] || r.category, words });
  }
  return categories;
}

/* ---------- ingest ---------- */

async function store(env, { category, slug, bytes, contentType, meta }) {
  const base = `${category}/${slug}`;
  const sidecar = {
    category,
    slug,
    build: BUILD,
    override: meta.override,
    license: meta.license,
    author: meta.author,
    title: meta.title,
    source_page: meta.source_page,
    source_url: meta.source_url,
    content_type: contentType,
    bytes: bytes.byteLength,
    ingested_at: new Date().toISOString(),
  };
  await env.IMAGES.put(`${base}.jpg`, bytes, { httpMetadata: { contentType } });
  await env.IMAGES.put(`${base}.json`, JSON.stringify(sidecar, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
  return { key: `${base}.jpg`, bytes: bytes.byteLength, sidecar: `${base}.json` };
}

const clean = v => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

async function ingest(request, env) {
  if (!isAuthorized(request, env)) return json({ ok: false, build: BUILD, error: "unauthorized" }, 401);

  const type = request.headers.get("content-type") || "";
  let fields, bytes, contentType, sourceUrl = null;

  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    fields = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
    const file = form.get("file");
    if (!file || typeof file === "string") return json({ ok: false, build: BUILD, error: "multipart upload needs a file field" }, 400);
    contentType = (file.type || "").split(";")[0].trim();
    bytes = await file.arrayBuffer();
  } else {
    try { fields = await request.json(); } catch { return json({ ok: false, build: BUILD, error: "body must be JSON or multipart" }, 400); }
    sourceUrl = fields.source_url;
    if (!sourceUrl || !/^https:\/\//.test(sourceUrl)) return json({ ok: false, build: BUILD, error: "source_url must be an https URL" }, 400);
    const upstream = await fetch(sourceUrl, { headers: { "user-agent": USER_AGENT } });
    if (!upstream.ok) return json({ ok: false, build: BUILD, error: `source returned HTTP ${upstream.status}` }, 502);
    contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim();
    const declared = Number(upstream.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return json({ ok: false, build: BUILD, error: "source image is larger than 15 MB" }, 413);
    bytes = await upstream.arrayBuffer();
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    return json({ ok: false, build: BUILD, error: `not an allowed image type (${contentType || "none"})` }, 415);
  }
  if (bytes.byteLength > MAX_BYTES) return json({ ok: false, build: BUILD, error: "image is larger than 15 MB" }, 413);

  const category = clean(fields.category);
  if (!KEY_PART.test(category || "")) {
    return json({ ok: false, build: BUILD, error: "category must be lowercase words joined by dashes" }, 400);
  }

  const name = clean(fields.name) || clean(fields.title);
  let slug = clean(fields.slug);
  if (!slug && name) {
    const categories = await buildCatalog();
    const cat = categories.find(c => c.id === category);
    const word = cat && cat.words.find(w => w.name.toLowerCase() === name.toLowerCase());
    slug = (word && word.slug) || photoSlug(name);
  }
  if (!KEY_PART.test(slug || "")) {
    return json({ ok: false, build: BUILD, error: "give a name (or slug) using letters, numbers and dashes" }, 400);
  }

  const override = String(fields.override) === "true";
  const result = await store(env, {
    category,
    slug,
    bytes,
    contentType,
    meta: {
      override,
      license: clean(fields.license) || (override ? "Manual override" : null),
      author: clean(fields.author),
      title: name,
      source_page: clean(fields.source_page),
      source_url: sourceUrl,
    },
  });
  return json({ ok: true, build: BUILD, ...result });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, build: BUILD });
      if (request.method === "GET" && url.pathname === "/catalog") {
        return json({ ok: true, build: BUILD, categories: await buildCatalog() });
      }
      if (request.method === "GET" && url.pathname === "/categories.txt") {
        const categories = await buildCatalog();
        return text(categories.map(c => `${c.id}|${c.name}`).join("\n"));
      }
      if (request.method === "POST" && url.pathname === "/ingest") return await ingest(request, env);
      return json({ ok: false, build: BUILD, error: "not found" }, 404);
    } catch (err) {
      return json({ ok: false, build: BUILD, error: String((err && err.message) || err) }, 500);
    }
  },
};
