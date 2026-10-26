# Local Quality Preview

Run from the repository root:

```sh
./node_modules/.bin/vite --config design/preview/vite.config.ts
```

Open `http://127.0.0.1:4340/design/preview/index.html`.

This harness renders the production new-tab, popup and options components with
synthetic browser data. It is not a shipping route and is not included in the
extension manifest or production build. Keep it local; do not publish it as part
of the product website.

- The loopback origin has its own local database. Each fixture reload clears and
  recreates only that preview database, never the installed extension's database.
- Browser tab operations are mocked. App and quote fetches are disabled. Do not
  import private browser data into the fixture.
- Toolbar links switch theme, width, wallpaper and empty-data cases.
- Query parameters include `screen=popup`, `screen=options`, `width=390`,
  `theme=dark`, `section=tabs`, `section=bookmarks`, `wallpaper=1` and `empty=1`.
- A fixture cannot prove native toolbar-popup sizing. Always reload and inspect
  the already-installed extension as a separate runtime check.
