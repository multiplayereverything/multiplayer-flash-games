# Tauri rewrite (prototype)

The launcher rebuilt as a Tauri 2 app: Rust back end, React + TypeScript front end. The C++ launcher in `src/`
stays the one that ships until this one has parity.

Prototype status: the same layout as the C++ launcher's Quiver-style one, drawn from `src/launcher.data.json` (a
slimmed export of `launcher/launcher.json`, made by hand for now). Nothing installs, plays or connects yet.

- A top bar (Library, Rooms, Settings); the library is full width: Continue playing, a toolbar of chip menus
  (category, order), search and Compact, then poster cards with Play on hover.
- A card opens its game's page (sliding in): backdrop header, icon, Verified pill, Overview / Details / Releases
  tabs, and the play panel as the right column. Esc or Back returns.
- Key hints in the status bar; with a game controller (the browser's Gamepad API) the D-pad moves between
  controls, A presses, B goes back, Y searches, LB and RB switch Library and Rooms, and the hints show its buttons.
- `src/mock.ts` stands in for what the real launcher learns at run time (installed versions, mods-info, play times).

```bash
cd tauri
npm install
npm run dev          # the UI alone, in a browser at http://localhost:1420
npx tauri dev        # the real window
npx tauri build --no-bundle   # src-tauri/target/release/app.exe
```

Ideas are borrowed from Quiver Launcher (rounded cards, art first, one restrained accent). Its source is BSL 1.1,
so none of its code is used.
