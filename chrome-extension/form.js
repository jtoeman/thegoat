// EXT2: form for one image. Categories come from the GOAT words sheet (Categories tab).
// Almost nothing is required: a blank category goes to Uncategorized, a blank name uses the page title,
// and a blank license or credit is recorded as an own asset.
const WORKER = "https://goat-image-ingest.jeremy-86d.workers.dev/ingest";
const SHEET_ID = "1FbM320qaloYDHZHRAvLfDiK-IeKeM4TUaQo_hve_KsU";
const INDEX_GID = 1558846279;
const UNCATEGORIZED = { id: "uncategorized", name: "Uncategorized" };
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let src = params.get("src") || "";
const pageTitle = params.get("title") || "";

const setMsg = (text, cls) => { const m = $("msg"); m.textContent = text; m.className = cls || ""; };
const slugify = s => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

function init(){
  // Chrome sometimes opens the form with a Wikimedia-style http link; the Worker needs https.
  if(src.startsWith("http://")) src = "https://" + src.slice(7);
  $("preview").src = src;
  $("source_page").value = params.get("page") || "";
  $("name").value = pageTitle.replace(/\s[-|–].*$/, "").trim();
  $("foot").textContent = "EXT2 · " + (src.startsWith("https://") ? "ready" : "not an https image: cannot add");
  fillCategories();
}

$("submit").addEventListener("click", async () => {
  if(!src.startsWith("https://")) return setMsg("This image is not an https address, so it cannot be added.", "err");
  const stored = await chrome.storage.local.get("ingestToken");
  if(!stored.ingestToken) return setMsg("Add your ingest token in the extension options first.", "err");

  const category = $("category").value || UNCATEGORIZED.id;
  const name = $("name").value.trim() || pageTitle || "image";
  let slug = slugify(name) || slugify(decodeURIComponent((src.split("/").pop() || "").split("?")[0].replace(/\.[a-z]+$/i, ""))) || ("image-" + Date.now().toString(36));
  const license = $("license").value || "Own asset (assumed)";
  const author = $("author").value.trim() || null;

  $("submit").disabled = true;
  setMsg("Adding…");
  try{
    const res = await fetch(WORKER, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + stored.ingestToken },
      body: JSON.stringify({
        category, slug, source_url: src,
        title: name, license, author,
        source_page: $("source_page").value.trim() || null
      })
    });
    const data = await res.json().catch(() => ({}));
    if(res.ok && data.ok){
      await chrome.storage.local.set({ lastCategory: category });
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
});

init();
