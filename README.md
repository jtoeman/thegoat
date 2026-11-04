# goat-site

Static site for The GOAT game. Single-file build in `index.html` plus image assets in `assets/`.

Deployed to Cloudflare Pages project `goat` (https://goat.vomint.com).
Each push to `main` is the build that goes live.

Votes are stored in Supabase (project `goat`, table `votes`).

## Word sheet

The game reads its categories and words from the Google Sheet "GOAT words" when the page loads
(`WORDS_URL` in index.html). Edits in the sheet go live on the next page load, without a new build.
If the sheet can't be reached, the built-in lists in index.html are used.

One tab, one row per item. Columns:

- `type`: `category` or `word`
- `category`: the category id (lowercase, no spaces), e.g. `fruit`, `dogs`
- `name`: the category name (category rows) or the word (word rows)
- `on`: `TRUE` or `FALSE`. `FALSE` hides a word without deleting it, so existing picks still count (blank means TRUE)
- `emoji`, `color`, `photo`, `code`: optional per word. `photo` is a path such as `assets/dogs/beagle.jpg`
- `bg`, `art`, `ladder`, `seeded`: category rows only. `art` is `fruit` (silhouette) or `letter`. `ladder` is the save key; keep it unchanged for an existing category

Renaming a word starts a new matchup history for it, since picks are keyed by name. Hiding with `on = FALSE` is the safe option.
A category needs at least two visible words to appear in the game.
