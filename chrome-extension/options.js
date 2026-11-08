const $ = id => document.getElementById(id);
chrome.storage.local.get("ingestToken").then(v => { $("token").value = v.ingestToken || ""; });
$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ ingestToken: $("token").value.trim() });
  $("msg").textContent = "Saved.";
});
