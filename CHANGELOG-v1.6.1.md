# v1.6.1 — Catalog collector repair

- Parses plain hyperlinks, serialized HTML/Next-style data, and TMDB-style title objects embedded in publicly returned browse pages.
- Falls back to Playwright Chromium for titles loaded by JavaScript on page navigation.
- Captures public JSON responses loaded by the browse pages when they contain movie/TV objects.
- Prints safe diagnostics (HTML length, anchor and script counts, network title count).
- Retains existing JSON on total failure or suspiciously small results.
- No Fire TV APK code changes; existing v1.6 installation can fetch updated JSON.
