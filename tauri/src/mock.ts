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

export const platformBadge = (g: Game) => (g.mod ? 'PC' : g.categories?.includes('flash') ? 'Flash' : '')
