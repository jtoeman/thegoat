# GOAT Image Capture (EXT4, v0.4.0)

Right-click an image on any page, choose **Add to GOAT**, then pick a category and submit. Categories come from the **Categories** tab of the GOAT words sheet. Anything left blank still goes through:

- blank category → **Uncategorized**
- blank name → the page title
- blank license → recorded as "Own asset (assumed)"
- blank credit → no credit recorded

The Worker fetches the image and stores it under `<category>/<slug>.jpg` in the goat-images bucket, with a sidecar JSON.

## Install (once, Chrome on Mac)
1. Open `chrome://extensions`, turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Open the extension's **Details → Extension options**, paste the ingest token, and save.

## Notes
- The sheet must stay shared as "Anyone with the link".
- The game reads each image from the `photo` column of its category tab. After adding an image, put its URL (`https://images.froobaloo.com/<category>/<slug>.jpg`) in that column.
- Adding a name that already exists in a category overwrites its image and sidecar. Check before you submit.
- Only https images can be added. Signed or expiring links may fail.

## Overwrite policy (EXT4)
- Before sending, the form checks for an existing image at the same category and name.
- If one exists, it shows both images as game cards (current on the left, new on the right) with their names, plus the license, credit and date of the current one, and asks you to **Replace**, **Save as a new name** (adds -2, -3…), or **Keep current**.
- Nothing is replaced without a choice.
