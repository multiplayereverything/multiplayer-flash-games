// What the window shows about a game, worked out from the launcher's answer the way the C++ window does.
import type { Action, Game, Library, ModInfo } from './api'

export type StatusKind = 'ready' | 'installed' | 'update' | 'missing' | 'soon' | 'checking' | 'playing'
export interface Status { kind: StatusKind; text: string }

// "1.10.0" after "1.9.2": numbers compared as numbers.
export function newer(a: string, b: string): boolean {
  const x = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const y = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

export function statusOf(g: Game, lib: Library, mods: Record<string, ModInfo> | null, playing: boolean): Status {
  const t = (k: string, fallback: string) => lib.text[k] ?? fallback
  if (g.comingSoon) return { kind: 'soon', text: t('status.comingSoon', 'Coming soon') }
  if (playing) return { kind: 'playing', text: 'Playing' }
  if (g.mod) {
    const m = mods?.[g.id]
    if (!m) return { kind: 'checking', text: 'Checking...' }
    if (!m.gameFound) return { kind: 'missing', text: `${g.mod.gameName || g.name} not found` }
    if (m.problem) return { kind: 'missing', text: m.problem }
    if (!m.installed) return { kind: 'missing', text: 'Not installed' }
    if (m.published && newer(m.newest, m.installedVersion)) return { kind: 'update', text: `Update ${m.newest} available` }
    return { kind: 'installed', text: `Installed ${m.installedVersion}` }
  }
  const states = g.actions.filter((a) => a.state).map((a) => a.state)
  if (states.includes('ready')) return { kind: 'ready', text: t('status.ready', 'Ready') }
  if (states.includes('noPlayer')) return { kind: 'missing', text: t('status.noPlayer', 'No Flash player found') }
  return { kind: 'missing', text: t('status.noSwf', 'Game file missing') }
}

export function lastPlayed(lib: Library, id: string): number {
  return lib.user.games[id]?.lastPlayed ?? 0
}

export function agoText(unix: number): string {
  const s = Math.max(0, Date.now() / 1000 - unix)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export function playedText(lib: Library, id: string): string {
  const u = lib.user.games[id]
  if (!u || !u.plays) return 'Not played yet'
  const mins = Math.round(u.seconds / 60)
  return `Played ${u.plays} time${u.plays === 1 ? '' : 's'}${mins ? ` for ${mins} min in total` : ''}, last ${agoText(u.lastPlayed)}.`
}

const plain = (a: Action) => !a.mod && !a.link

// Ruffle Together co-op: the game has both a host and a join action, so Host a game and Join a game stand in for them.
export const isCoop = (g: Game) => g.actions.some((a) => a.coopHost) && g.actions.some((a) => a.coopJoin)

// The buttons besides Host and Join: what isn't hosting, joining, folded under "more" or the unmodded original.
export function mainActions(g: Game): Action[] {
  const coop = isCoop(g)
  return g.actions.filter((a) => plain(a) && !a.more && !a.original && !(coop && (a.coopHost || a.coopJoin)))
}

export interface HostChoice { action: Action; players: number; relay: boolean }
export const hostChoices = (g: Game): HostChoice[] =>
  g.actions.filter((a) => a.coopHost && a.hostPlayers > 0).map((a) => ({ action: a, players: a.hostPlayers, relay: a.viaRelay }))

export const joinByCode = (g: Game): Action | undefined =>
  g.actions.find((a) => a.id === g.joinAction && a.joinsByCode) ?? g.actions.find((a) => a.joinsByCode)
export const joinByAddress = (g: Game): Action | undefined => g.actions.find((a) => a.asksAddress)

// A friend's address looks like 1.2.3.4:7790 or a host name with a port; a room code is five letters and digits.
export const looksLikeAddress = (s: string) => /[.:]/.test(s.trim())

// What the banner and a card's Play start: the game's first plain action (PC mods have none here).
export function leadAction(g: Game): Action | undefined {
  if (g.mod || g.comingSoon) return undefined
  return g.actions.find((a) => plain(a) && !a.more && !a.original)
}

export const platformBadge = (g: Game) => (g.mod ? 'PC' : g.categories.includes('flash') ? 'Flash' : '')
