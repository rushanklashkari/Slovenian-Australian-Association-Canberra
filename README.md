# Slovenian Australian Association Canberra — website

- `index.html` — the whole site (single page, hash routing: `#home`, `#committee`, …)
- `images/` — site photos
- `audio/` — background music for the player
- `archive/photos/` — Photo Archive source photos (one folder per event)
- `build-archive.js` — builds the Photo Archive pages; Netlify runs it on every deploy (`netlify.toml`)

## Adding photos to the Photo Archive
1. Shrink the photos first (Mac Finder: select all → right-click → Quick Actions →
   Convert Image → JPEG, size Large).
2. Make a folder in `archive/photos/` named with the date first, then the event:
   `2025-12-06 Miklavz`, `2025-11 Grape Harvest`, `2024 Christmas Party`.
3. Optional: name one photo `cover.jpg` to choose the event's tile image, and add an
   `info.txt` (line 1 = title to display, next lines = short description).
4. Commit and push. Netlify rebuilds the archive automatically (about a minute).

To preview locally: `node build-archive.js`, then open `archive/index.html`.
The generated `archive/*.html` files are not committed (see `.gitignore`).
