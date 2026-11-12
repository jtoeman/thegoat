// EXT6 (v0.6.0): category and name are dropdowns read from the GOAT sheet,
// with "+ New" for either. The top of the form shows the image as it will appear in game.
// Before sending, an existing image at the same category and name opens a Replace / Save as new / Keep choice.
const WORKER = "https://goat-image-ingest.jeremy-86d.workers.dev";
const SHEET_ID = "1FbM320qaloYDHZHRAvLfDiK-IeKeM4TUaQo_hve_KsU";
const INDEX_GID = 1558846279; // the "Categories" tab
const IMAGE_BASE = "https://images.froobaloo.com/";
const UNCATEGORIZED = "uncategorized";
const NEW = "__new__";
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let src = params.get("src") || "";
const pageTitle = params.get("title") || "";
let catalog = [];   // [{ id, name, words: [{ name, slug, photo }] }]
let pending = null; // the submission waiting on the conflict choice

const setMsg = (text, cls) => { const m = $("msg"); m.textContent = text; m.className = cls || ""; };
const slugify = s => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const urlFor = (category, slug) => IMAGE_BASE + category + "/" + slug + ".jpg";
const defaultName = () => pageTitle.replace(/\s[-|–].*$/, "").trim();

/* Minimal CSV reader: quoted fields, doubled quotes, CRLF or LF. Keys are lowercase headers. */
function parseCSV(text){
  const rows = []; let row = [], field = "", q = false;
  text = text.replace(/^\uFEFF/, "");
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
/* One sheet tab as CSV. Retries because Google sometimes refuses a burst of reads; a sign-in or error page is a failure. */
async function sheetTab(gid){
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  let lastErr = new Error("no response");
  for(let attempt = 0; attempt < 3; attempt++){
    try{
      const r = await fetch(url, { cache: "no-store" });
      if(!r.ok) throw new Error("HTTP " + r.status);
      const t = await r.text();
      if(t.trim().startsWith("<")) throw new Error("not a sheet export");
      return t;
    }catch(e){
      lastErr = e;
      await new Promise(res => setTimeout(res, 700 * (attempt + 1)));
    }
  }
  throw lastErr;
}
const idOf = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const photoSlugOf = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* A word's slug is the file name in its sheet photo column when that photo is in this category's folder. */
function slugFor(word, category){
  const prefix = IMAGE_BASE + category + "/";
  if(word.photo && word.photo.startsWith(prefix)){
    const file = word.photo.slice(prefix.length).split("?")[0].replace(/\.jpg$/i, "");
    if(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(file)) return file;
  }
  return photoSlugOf(word.name);
}

let catalogProblems = [];

/* Every category on the Categories tab is listed. A tab that fails to load keeps its last saved names. */
async function loadCatalog(){
  const saved = await chrome.storage.local.get(["goatCatalog", "goatWordsCache"]);
  const wordsCache = saved.goatWordsCache || {};
  let index;
  try{
    index = parseCSV(await sheetTab(INDEX_GID)).filter(r => r.category && r["tab id"]);
  }catch(e){
    catalogProblems = ["Categories tab: " + e.message];
    return saved.goatCatalog || [];
  }
  const cats = [], seen = new Set(), problems = [];
  for(const r of index){
    const id = idOf(r.category);
    if(!id || id === UNCATEGORIZED || seen.has(id)) continue;
    seen.add(id);
    const name = r["display name"] || r.category;
    let words;
    try{
      const rows = parseCSV(await sheetTab(r["tab id"]));
      const names = new Set();
      words = [];
      for(const w of rows){
        if(!w.name || (w.on || "TRUE").toUpperCase() === "FALSE" || names.has(w.name)) continue;
        names.add(w.name);
        words.push({ name: w.name, slug: slugFor(w, id), photo: w.photo || null });
      }
      wordsCache[id] = words;
    }catch(e){
      problems.push(`${name} (${e.message})`);
      words = wordsCache[id] || [];
    }
    cats.push({ id, name, words });
  }
  await chrome.storage.local.set({ goatCatalog: cats, goatWordsCache: wordsCache });
  catalogProblems = problems;
  return cats;
}

async function fillCategories(){
  catalog = (await loadCatalog()).filter(c => c.id !== UNCATEGORIZED);
  const opts = catalog.map(c => `<option value="${c.id}">${c.name}</option>`);
  opts.push(`<option value="${UNCATEGORIZED}">Uncategorized</option>`, `<option value="${NEW}">+ New category…</option>`);
  $("category").innerHTML = opts.join("");
  const last = (await chrome.storage.local.get("lastCategory")).lastCategory;
  const known = last === UNCATEGORIZED || catalog.some(c => c.id === last);
  $("category").value = known ? last : (catalog[0] ? catalog[0].id : UNCATEGORIZED);
  if(!catalog.length) setMsg("Could not load the categories from the sheet. Images will go to Uncategorized.", "err");
  else if(catalogProblems.length) setMsg("Could not refresh " + catalogProblems.join("; ") + ". Showing the last saved names for those.", "err");
  onCategoryChange();
}

function wordsIn(id){ const c = catalog.find(c => c.id === id); return c ? c.words : []; }

function onCategoryChange(){
  const v = $("category").value;
  $("newCategory").hidden = v !== NEW;
  $("newCategoryHint").hidden = v !== NEW;
  const words = wordsIn(v);
  $("nameSel").innerHTML = words.map((w, i) => `<option value="${i}">${w.name}</option>`).join("") + `<option value="${NEW}">+ New name…</option>`;
  const title = defaultName().toLowerCase();
  const hit = words.findIndex(w => w.name.toLowerCase() === title);
  $("nameSel").value = hit >= 0 ? String(hit) : NEW;
  onNameChange();
}

function onNameChange(){
  const isNew = $("nameSel").value === NEW;
  $("nameText").hidden = !isNew;
  if(isNew && !$("nameText").value) $("nameText").value = defaultName();
  updateCard();
}

/* What the submission will be, from the dropdowns or the typed new values. */
function choice(){
  const v = $("category").value;
  const category = v === NEW ? slugify($("newCategory").value) : v;
  let name, slug;
  if($("nameSel").value === NEW){
    name = $("nameText").value.trim() || defaultName() || "image";
    slug = slugify(name);
  } else {
    const w = wordsIn(v)[Number($("nameSel").value)];
    name = w.name;
    slug = w.slug;   // the sheet's photo file name, so "Taylor Swift" keeps taylorswift
  }
  if(!slug) slug = slugify(decodeURIComponent((src.split("/").pop() || "").split("?")[0].replace(/\.[a-z]+$/i, ""))) || ("image-" + Date.now().toString(36));
  return { category, name, slug };
}

/* Preview at the top: the image on a game fighter with the name plate. */
function updateCard(){
  const name = choice().name;
  $("cardPlateA").textContent = name;
  $("cardPlateB").textContent = name;
}
$("expand").addEventListener("click", () => {
  const wrap = $("cardWrap");
  const on = wrap.classList.toggle("expanded");
  $("expand").textContent = on ? "Close" : "Full height";
});

/* Is there already an image at this category/name? HEAD only, so nothing is downloaded. */
async function exists(category, slug){
  try{ return (await fetch(urlFor(category, slug), { method: "HEAD", cache: "no-store" })).ok; }
  catch(e){ return false; }
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

function showConflict(p, side){
  $("cur").src = urlFor(p.category, p.slug) + "?v=" + Date.now();
  $("incoming").src = src;
  $("curPlate").textContent = (side && side.title) || p.slug.replace(/-/g, " ");
  $("newPlate").textContent = p.name;
  const who = side ? `${side.license || "no license"}${side.author ? " · " + side.author : ""}${side.ingested_at ? " · added " + side.ingested_at.slice(0, 10) : ""}` : "no details saved";
  $("conflictText").textContent = `${p.category}/${p.slug} already has an image. Which should the game use?`;
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

async function send(p){
  const stored = await chrome.storage.local.get("ingestToken");
  if(!stored.ingestToken) return setMsg("Add your ingest token in the extension options first.", "err");
  $("submit").disabled = true;
  setMsg("Adding…");
  try{
    const res = await fetch(WORKER + "/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + stored.ingestToken },
      body: JSON.stringify({ category: p.category, slug: p.slug, name: p.name, source_url: src, license: p.license, author: p.author, source_page: p.sourcePage })
    });
    const data = await res.json().catch(() => ({}));
    if(res.ok && data.ok){
      await chrome.storage.local.set({ lastCategory: p.category });
      hideConflict();
      const note = wordsIn(p.category).some(w => w.slug === p.slug) ? "" : " (new name: add it to the sheet for the game to show it)";
      setMsg(`Added ${p.category}/${p.slug}.jpg${note}`, "ok");
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
  // Chrome sometimes opens the form with an http link; the Worker needs https.
  if(src.startsWith("http://")) src = "https://" + src.slice(7);
  $("cardImgA").src = src;
  $("cardImgB").src = src;
  $("source_page").value = params.get("page") || "";
  $("foot").textContent = "EXT6 · v0.6.2 · " + (src.startsWith("https://") ? "ready" : "not an https image: cannot add");
  fillCategories();
}

$("category").addEventListener("change", onCategoryChange);
$("nameSel").addEventListener("change", onNameChange);
$("nameText").addEventListener("input", updateCard);
$("newCategory").addEventListener("input", updateCard);

$("submit").addEventListener("click", async () => {
  if(!src.startsWith("https://")) return setMsg("This image is not an https address, so it cannot be added.", "err");
  const c = choice();
  if(!c.category) return setMsg("Type a name for the new category.", "err");
  const p = { ...c, license: $("license").value || "Own asset (assumed)", author: $("author").value.trim() || null, sourcePage: $("source_page").value.trim() || null };
  setMsg("Checking…");
  if(await exists(p.category, p.slug)){
    pending = p;
    return showConflict(p, await sidecarOf(p.category, p.slug));
  }
  send(p);
});

$("replace").addEventListener("click", () => { if(pending) send(pending); });
$("newName").addEventListener("click", async () => {
  if(!pending) return;
  const p = { ...pending, slug: await freeSlug(pending.category, pending.slug) };
  send(p);
});
$("keep").addEventListener("click", () => {
  hideConflict();
  setMsg("Not added. The current image was kept.");
});

/* Enter submits from a text box or dropdown, as long as the name is filled in (EXT3). */
document.addEventListener("keydown", e => {
  if(e.key !== "Enter" || e.isComposing) return;
  if(!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) return;
  if(!$("conflict").hidden) return;
  if($("nameSel").value === NEW && !$("nameText").value.trim()) return;
  e.preventDefault();
  $("submit").click();
});

init();
