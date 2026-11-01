# The prototype's look

The layout follows RecompLauncher (github.com/elripalda/RecompLauncher, GPL-3.0). We took its ideas, not
its code: nothing here is copied from it, so our license is unaffected. The colors, fonts and buttons are
our own launcher's, from `src/core/config.cpp` in the C++ launcher.

## Taken from RecompLauncher's layout

- A sidebar: Home, Library and Open rooms, favorites pinned underneath with their art, then your name,
  Settings and Collapse at the foot.
- The window draws its own title bar, and pages scroll beneath it.
- Home: a banner that rotates through a few games (dots and arrows, pauses under the mouse). Under it are
  shelves (Jump back in, Play together online, PC game mods, Coming soon) that page sideways.
- Library: a centered title and a large search box. One row holds the sort order, the category picker and
  two switches (Favorites, Ready to play). The count sits above a grid of box-art tiles.
- Tiles: art with the name and the player pips under it. On hover, a tile lifts over a glow of its own art
  and a round Play appears.
- Game page:
  - A wide art header that fades into a blurred copy of itself.
  - The cover, title and Play side by side, with one or two big buttons, a star and a "..." menu.
  - Tabs on a sliding pill.
  - Four stat boxes (Played, Last played, Players, a fourth that depends on the game).
  - At the right, a "Ready to play" checklist that ticks off what the game needs.
- Messages, running games and mod jobs float in an "island" at the bottom center.

## Ours (unchanged from the C++ launcher)

- **Palette:**
  - Background `#0B1119`, panels `#141B26` and `#1F2835`, sidebar `#070C13`.
  - Text `#E6EBF2` and `#93A0B3`.
  - Borders `#253041`.
- **Fonts:** Bahnschrift for titles and buttons, Segoe UI for body text.
- **What each color means:**
  - Red `#C8313A` means start (Play, Host, Install).
  - Light blue `#38BDF8` means keyboard focus and online.
  - Green means ready.
  - Selection is a neutral outline.
- **Buttons:** 6px corners with a 1px border, as `drawButton` paints them.
- **Avoided:** all-caps labels and invented logos.
- **Covers:** our own pixel-font initials on the game's colors. A picture wider than a poster shows whole,
  over a blurred copy of itself.
- **Player slots:** the P1-P6 slots in `branding.playerColors` remain the one bold element.
