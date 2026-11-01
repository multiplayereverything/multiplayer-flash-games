# Tauri rewrite (prototype)

The launcher rebuilt as a Tauri 2 app: Rust back end, React + TypeScript front end. The C++ launcher in `src/`
stays the one that ships until this one has parity.

Prototype status: the same layout as the C++ launcher's Quiver-style one, and it works: the C++ launcher exe is its
engine until each part is rewritten in Rust (`src-tauri/src/engine.rs`).

- The library, every action's state, the UI texts and your stats come from `--list --json`; the PC mods from
  `--mods --json`; open rooms from `--rooms <id> --json`.
- Play, Host (players and room code or IP), Join (room code or address), the rooms' Join buttons, and mod
  Install / Update / Launch / Repair / Uninstall run `--launch`, `--join`, `--address` and the mod commands.
- Favorites are written to the launcher's own `settings.json`, so both windows agree.

It finds the exe through `FL_LAUNCHER_EXE`, or next to its own exe (the shipped layout):

```bash
set FL_LAUNCHER_EXE=C:\path\to\build\Debug\MultiplayerEverythingLauncher.exe
npx tauri dev
```

In a plain browser (`npm run dev`) the bundled `src/launcher.data.json` stands in, so the UI can be worked on without
the exe. Settings, the lobby window and the hosting box still live in the C++ launcher.

- A top bar (Library, Rooms, Settings); the library is full width: Continue playing, a toolbar of chip menus
  (category, order), search and Compact, then poster cards with Play on hover.
- A card opens its game's page (sliding in): backdrop header, icon, Verified pill, Overview / Details / Releases
  tabs, and the play panel as the right column. Esc or Back returns.
- Key hints in the status bar; with a game controller (the browser's Gamepad API) the D-pad moves between
  controls, A presses, B goes back, Y searches, LB and RB switch Library and Rooms, and the hints show its buttons.

```bash
cd tauri
npm install
npm run dev          # the UI alone, in a browser at http://localhost:1420
npx tauri dev        # the real window
npx tauri build --no-bundle   # src-tauri/target/release/app.exe
```

Ideas are borrowed from Quiver Launcher (rounded cards, art first, one restrained accent). Its source is BSL 1.1,
so none of its code is used.
