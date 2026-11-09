// EXT2: adds "Add to GOAT" to the right-click menu on images and opens the form for that image.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "goat-add-image", title: "Add to GOAT", contexts: ["image"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "goat-add-image" || !info.srcUrl) return;
  const params = new URLSearchParams({
    src: info.srcUrl,
    page: (tab && tab.url) || info.pageUrl || "",
    title: (tab && tab.title) || ""
  });
  chrome.windows.create({
    url: chrome.runtime.getURL("form.html?" + params.toString()),
    type: "popup",
    width: 460,
    height: 680
  });
});
