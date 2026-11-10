// EXT4: form for one image. Before sending, checks whether category/name already exists in the bucket and
// asks: replace, save under a new name, or cancel. Categories come from the GOAT words sheet.
const WORKER = "https://goat-image-ingest.jeremy-86d.workers.dev/ingest";
const IMAGE_BASE = "https://images.froobaloo.com/";
const SHEET_ID = "1FbM320qaloYDHZHRAvLfDiK-IeKeM4TUaQo_hve_KsU";
const INDEX_GID = 1558846279;
const UNCATEGORIZED = { id: "uncategorized", name: "Uncategorized" };
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let src = params.get("src") || "";
const pageTitle = params.get("title") || "";
let pending = null;   // { category, slug, name, license, author, sourcePage } while the conflict panel is open

const setMsg = (text, cls) => { const m = $("msg"); m.textContent = text; m.className = cls || ""; };
const slugify = s => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const urlFor = (category, slug) => IMAGE_BASE + category + "/" + slug + ".jpg";

/* Minimal CSV reader: quoted fields, doubled quotes, CRLF or LF. Keys are lowercase headers. */
function parseCSV(text){
  const rows = []; let row = [], field = "", q = false;
  text = text.replace(/^﻿/, "");
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(q){
      if(ch === '"'){ if(text[i + 1] === '"'){ field += '"'; i++; } else q = false; }
      else field += ch;
    } else if(ch === '"') q = true;
    else if(ch === ","){ row.push(field); field = ""; }
    else if(ch === "\n" || ch === "\r"){
      if(ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if(field || row.length){ row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  return rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

/* Categories from the sheet's Categories tab. Falls back to the last good list, then to Uncategorized only. */
async function loadCategories(){
  try{
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${INDEX_GID}`, { cache: "no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const cats = parseCSV(await res.text())
      .filter(r => r.category)
      .map(r => ({ id: r.category.toLowerCase().replace(/[^a-z0-9]/g, ""), name: r["display name"] || r.category }))
      .filter(c => c.id && c.id !== UNCATEGORIZED.id);
    await chrome.storage.local.set({ goatCats: cats });
    return cats;
  }catch(e){
    console.warn("categories not loaded from sheet", e);
    const cached = (await chrome.storage.local.get("goatCats")).goatCats;
    return Array.isArray(cached) ? cached : [];
  }
}

async function fillCategories(){
  const cats = [...await loadCategories(), UNCATEGORIZED];
  const last = (await chrome.storage.local.get("lastCategory")).lastCategory;
  $("category").innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  $("category").value = cats.some(c => c.id === last) ? last : UNCATEGORIZED.id;
  if(!cats.length) setMsg("Could not load categories from the sheet. Images will go to Uncategorized.", "err");
}

/* Is there already an image at this category/name? HEAD only, so nothing is downloaded. */
async function exists(category, slug){
  try{
    const r = await fetch(urlFor(category, slug), { method: "HEAD", cache: "no-store" });
    return r.ok;
  }catch(e){ return false; }
}
async function sidecarOf(category, slug){
  try{
    const r = await fetch(IMAGE_BASE + category + "/" + slug + ".json", { cache: "no-store" });
    return r.ok ? await r.json() : null;
  }catch(e){ return null; }
}
/* First free name: "name", then "name-2", "name-3"... */
async function freeSlug(category, base){
  if(!(await exists(category, base))) return base;
  for(let i = 2; i < 100; i++){
    const s = base + "-" + i;
    if(!(await exists(category, s))) return s;
  }
  return base + "-" + Date.now().toString(36);
}

function showConflict(category, slug, current){
  $("cur").src = current.url + "?v=" + Date.now();
  $("incoming").src = src;
  const side = current.info;
  const who = side ? `${side.license || "no license"}${side.author ? " · " + side.author : ""}${side.ingested_at ? " · added " + side.ingested_at.slice(0, 10) : ""}` : "no details saved";
  $("conflictText").textContent = `${category}/${slug} already has an image. Which should the game use?`;
  $("conflictInfo").textContent = `Current: ${who}`;
  $("conflict").hidden = false;
  $("submit").hidden = true;
  setMsg("");
}
function hideConflict(){
  $("conflict").hidden = true;
  $("submit").hidden = false;
  pending = null;
}

async function send(category, slug, name, license, author, sourcePage){
  const stored = await chrome.storage.local.get("ingestToken");
  if(!stored.ingestToken) return setMsg("Add your ingest token in the extension options first.", "err");
  $("submit").disabled = true;
  setMsg("Adding…");
  try{
    const res = await fetch(WORKER, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + stored.ingestToken },
      body: JSON.stringify({ category, slug, source_url: src, title: name, license, author, source_page: sourcePage })
    });
    const data = await res.json().catch(() => ({}));
    if(res.ok && data.ok){
      await chrome.storage.local.set({ lastCategory: category });
      hideConflict();
      setMsg(`Added ${category}/${slug}.jpg`, "ok");
      setTimeout(() => window.close(), 1500);
    } else {
      setMsg("Not added: " + (data.error || ("HTTP " + res.status)), "err");
    }
  }catch(e){
    setMsg("Not added: could not reach the ingest Worker.", "err");
  }finally{
    $("submit").disabled = false;
  }
}

function init(){
  // Chrome sometimes opens the form with a Wikimedia-style http link; the Worker needs https.
  if(src.startsWith("http://")) src = "https://" + src.slice(7);
  $("preview").src = src;
  $("source_page").value = params.get("page") || "";
  $("name").value = pageTitle.replace(/\s[-|–].*$/, "").trim();
  $("foot").textContent = "EXT4 · v0.4.0 · " + (src.startsWith("https://") ? "ready" : "not an https image: cannot add");
  fillCategories();
}

$("submit").addEventListener("click", async () => {
  if(!src.startsWith("https://")) return setMsg("This image is not an https address, so it cannot be added.", "err");
  const category = $("category").value || UNCATEGORIZED.id;
  const name = $("name").value.trim() || pageTitle || "image";
  const base = slugify(name) || slugify(decodeURIComponent((src.split("/").pop() || "").split("?")[0].replace(/\.[a-z]+$/i, ""))) || ("image-" + Date.now().toString(36));
  const license = $("license").value || "Own asset (assumed)";
  const author = $("author").value.trim() || null;
  const sourcePage = $("source_page").value.trim() || null;

  setMsg("Checking…");
  if(await exists(category, base)){
    const info = await sidecarOf(category, base);
    pending = { category, slug: base, name, license, author, sourcePage };
    return showConflict(category, base, { url: urlFor(category, base), info });
  }
  send(category, base, name, license, author, sourcePage);
});

$("replace").addEventListener("click", () => {
  if(!pending) return;
  const p = pending;
  send(p.category, p.slug, p.name, p.license, p.author, p.sourcePage);
});
$("newName").addEventListener("click", async () => {
  if(!pending) return;
  const p = pending;
  const slug = await freeSlug(p.category, p.slug);
  send(p.category, slug, p.name, p.license, p.author, p.sourcePage);
});
$("keep").addEventListener("click", () => {
  hideConflict();
  setMsg("Not added. The current image was kept.");
});

/* EXT4: Enter submits from any text box, as long as the Name field has something in it. */
document.addEventListener("keydown", e => {
  if(e.key !== "Enter" || e.isComposing) return;
  if(!(e.target instanceof HTMLInputElement)) return;
  if(!$("name").value.trim()) return;
  if(!$("conflict").hidden) return;
  e.preventDefault();
  $("submit").click();
});

init();
