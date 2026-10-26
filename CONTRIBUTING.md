# Contributing

Thanks for helping improve DJS321 Tabs!

## Development setup

```bash
npm ci
npm run build      # outputs the unpacked extension to dist/
npm test
npm run lint
```

Load `dist/` in Chrome or Edge: open `chrome://extensions`, enable **Developer mode**, click
**Load unpacked** and select the `dist` folder. Run `npm run dev` to rebuild on change.

## Before you open a pull request

- Keep pull requests focused on one change; open an issue first for larger features.
- Add or update tests for logic changes. `npm test`, `npm run lint` and `npm run build` must pass.
- New user-facing text goes into `_locales/*/messages.json`, never hard-coded in components.
- Do not add network requests that run by default. Optional online features must be opt-in and
  documented in [PRIVACY.md](PRIVACY.md).
- Prefer optional permissions requested at the moment a feature is first used.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/), e.g. `fix(popup): keep focus after archiving`.

## Developer Certificate of Origin (DCO)

By contributing you certify the [Developer Certificate of Origin](https://developercertificate.org/).
Add a sign-off line to every commit, which `git commit -s` does for you:

```
Signed-off-by: Your Name <you@example.com>
```

Pull requests with unsigned commits fail the DCO check. Fix them with `git rebase --signoff main`.

## License

Contributions are licensed under the [Apache License 2.0](LICENSE). Names and icons are covered by
[TRADEMARKS.md](TRADEMARKS.md) and are not licensed for reuse.
