// Prototype-only state. The real launcher reads these from the mods-info repo, the saved settings and the player folder.
import type { Game } from './types'

export const INSTALLED: Record<string, string> = { 'spore-coop': '0.7.3.1', 'little-nightmares-coop': '0.7.1' }

// Mods whose package is not published yet.
export const COMING_SOON = new Set([
  'baldi-together',
  'miside-together',
  'cupheads',
  'rick-and-morty-together',
  'dave-the-diver-multiplayer',
  'gta-coop',
])

export type Status = { kind: 'ready' | 'installed' | 'missing' | 'soon'; text: string }

export function statusOf(g: Game): Status {
  if (COMING_SOON.has(g.id)) return { kind: 'soon', text: 'Coming soon' }
  if (g.mod) {
    const v = INSTALLED[g.id]
    return v ? { kind: 'installed', text: `Installed ${v}` } : { kind: 'missing', text: 'Not installed' }
  }
  if (g.online) return { kind: 'ready', text: 'Ready' }
  return { kind: 'ready', text: '' }
}

// When each game was played last, in hours ago: the banner shows the most recent, "Recently played" sorts by it.
export const PLAYED_HOURS_AGO: Record<string, number> = { gunmayhem2: 11, 'spore-coop': 50, stealthhunter2: 120 }

// The newest version mods-info publishes for a mod (its download is checked by SHA-256 before anything installs).
export const NEWEST: Record<string, string> = { 'spore-coop': '0.7.4', 'little-nightmares-coop': '0.7.1', 'spooky-together': '1.2.0' }

export function agoText(hours: number): string {
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export const PLAYER_COLORS = ['#E5484D', '#3E7BFA', '#2EBD6B', '#F5B83D', '#E5484D', '#3E7BFA']

// What a game's first button does, in its own words: the same lead the C++ details panel has.
export function leadAction(game: Game): { label: string; sub: string } | null {
  const st = statusOf(game)
  if (st.kind === 'soon') return null
  if (game.mod) {
    const name = game.mod.gameName ?? game.name
    return st.kind === 'installed'
      ? { label: 'Launch game', sub: `${game.name} ${INSTALLED[game.id]} is installed` }
      : { label: `Install ${name}`, sub: `Version ${NEWEST[game.id] ?? game.mod.version ?? 'latest'}, into your ${name} folder` }
  }
  return game.online ? { label: 'Play online', sub: 'Opens Ruffle Together' } : { label: 'Play', sub: 'The game on your own' }
}

export const platformBadge = (g: Game) => (g.mod ? 'PC' : g.categories?.includes('flash') ? 'Flash' : '')
