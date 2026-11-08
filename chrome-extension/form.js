// EXT1: form for one image. Posts to the ingest Worker (POST /ingest) with the saved token.
const WORKER = "https://goat-image-ingest.jeremy-86d.workers.dev/ingest";
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const src = params.get("src") || "";
$("preview").src = src;
$("source_page").value = params.get("page") || "";
$("name").value = (params.get("title") || "").replace(/\s[-|–].*$/, "").trim();
$("foot").textContent = "EXT1 · " + (src.startsWith("https://") ? "https image" : "not an https image: cannot add");

const slugify = s => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const setMsg = (text, cls) => { const m = $("msg"); m.textContent = text; m.className = cls || ""; };

$("submit").addEventListener("click", async () => {
  const category = slugify($("category").value);
  const slug = slugify($("name").value);
  const license = $("license").value;
  if (!src.startsWith("https://")) return setMsg("This image is not an https address, so it cannot be added.", "err");
  if (!category) return setMsg("Choose a category.", "err");
  if (!slug) return setMsg("Enter a name.", "err");
  if (!license) return setMsg("Choose a license. Only add images you have the right to use.", "err");
  const stored = await chrome.storage.local.get("ingestToken");
  if (!stored.ingestToken) return setMsg("Add your ingest token in the extension options first.", "err");

  $("submit").disabled = true;
  setMsg("Adding…");
  try {
    const res = await fetch(WORKER, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + stored.ingestToken },
      body: JSON.stringify({
        category, slug, source_url: src,
        title: $("name").value.trim(),
        license,
        author: $("author").value.trim() || null,
        source_page: $("source_page").value.trim() || null
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setMsg(`Added ${category}/${slug}.jpg`, "ok");
    } else {
      setMsg("Not added: " + (data.error || ("HTTP " + res.status)), "err");
    }
  } catch (e) {
    setMsg("Not added: could not reach the ingest Worker.", "err");
  } finally {
    $("submit").disabled = false;
  }
});
