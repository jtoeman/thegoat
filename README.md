# goat-site

Static site for The GOAT game. Single-file build in `index.html` plus image assets in `assets/`.

Deployed to Cloudflare Pages project `goat` (https://goat.vomint.com).
Each push to `main` is the build that goes live.

Votes are stored in Supabase (project `goat`, table `votes`).

## Word workbook

The game reads its categories and words from the Google Sheets workbook "GOAT words" when the page loads
(`WORDS_FILE` in index.html). Edits in the workbook go live on the next page load, without a new build.
If the workbook can't be reached, the built-in lists in index.html are used.

Tabs:

1. **Categories** (first tab): one row per category. Column A (Category) is filled in automatically from the tab names,
   and the Tab id column is filled in automatically too. You fill in the other columns:
   - Display name, Emoji, Background (a CSS gradient), Art (`fruit` for silhouettes, `letter` for letter portraits)
   - Ladder key: keep it unchanged for an existing category (it holds that category's saved run)
   - Seeded: `TRUE` or `FALSE`, leave FALSE for new categories
   - Visible words and Check are formulas. Check flags a category with fewer than two visible words.
2. **Template**: copy this tab to start a new category. Right-click the tab, Duplicate, then rename the copy.
   The copy keeps the headers, dropdowns, styles and summary formulas.
3. **One tab per category**, named with the category id (lowercase, letters and digits only, e.g. `fruit`, `dogs`).
   Columns:
   - `name`: the word as players see it
   - `on`: `TRUE` or `FALSE` from the dropdown. `FALSE` hides a word without deleting it, so existing picks still count
   - `emoji`, `color`, `photo`, `code`: optional. `photo` is a path such as `assets/dogs/beagle.jpg`. `code` is the letter code for the US states

Renaming a word starts a new matchup history for it, since picks are keyed by name. Hiding with `on = FALSE` is the safe option.
A category needs at least two visible words to appear in the game.

Setup (once): open the workbook, then Extensions > Apps Script. Paste the contents of `sync-categories.gs`, save,
and run `syncCategories` once to approve it. After that the Categories tab updates each time the workbook opens.
The workbook must be shared as "Anyone with the link" (Viewer) so the game can read it.
