# Tauri rewrite (prototype)

The launcher rebuilt as a Tauri 2 app: Rust back end, React + TypeScript front end. The C++ launcher in `src/`
stays the one that ships until this one has parity.

Prototype status: the game grid and details panel, drawn from `src/launcher.data.json` (a slimmed export of
`launcher/launcher.json`, made by hand for now). Nothing installs, plays or connects yet.

```bash
cd tauri
npm install
npm run dev          # the UI alone, in a browser at http://localhost:1420
npx tauri dev        # the real window
npx tauri build --no-bundle   # src-tauri/target/release/app.exe
```

Ideas are borrowed from Quiver Launcher (rounded cards, art first, one restrained accent). Its source is BSL 1.1,
so none of its code is used.
