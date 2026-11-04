# goat-site

Static site for The GOAT game. Single-file build in `index.html` plus image assets in `assets/`.

Deployed to Cloudflare Pages project `goat` (https://goat.vomint.com).
Each push to `main` is the build that goes live.

Votes are stored in Supabase (project `goat`, table `votes`).
