# GOAT Image Capture (EXT1)

Right-click an image on any page, choose **Add to GOAT**, fill in the category, name, license and credit, then **Add to GOAT**. The Worker fetches the image and stores it with its license file, the same way the ingest pipeline does.

## Install (once, Chrome on Mac)
1. Open `chrome://extensions`, turn on **Developer mode**.
2. Click **Load unpacked** and choose this `chrome-extension` folder.
3. Open the extension's **Details → Extension options**, paste the ingest token, and save.

## Notes
- Only https images can be added. Images that need a signed or expiring link may fail. The message will say so.
- Adding a name that already exists in that category overwrites the image and its license file. Check before you submit.
- The token is stored in Chrome's local extension storage on this laptop only.
