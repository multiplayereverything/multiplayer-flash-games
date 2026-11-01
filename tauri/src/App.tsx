import { useEffect, useMemo, useRef, useState } from 'react'
import raw from './launcher.data.json'
import { Cover } from './Cover'
import type { Game, LauncherData } from './types'
import './App.css'

const data = raw as unknown as LauncherData
const PLAYER_COLORS = ['#E5484D', '#3E7BFA', '#2EBD6B', '#F5B83D']
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&'

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The title decodes on a new selection: one of the few moves tied to a real event.
function useDecode(text: string): string {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    if (reduceMotion()) {
      setShown(text)
      return
    }
    let frame = 0
    const total = 14
    const id = window.setInterval(() => {
      frame++
      const settled = Math.floor((frame / total) * text.length)
      setShown(
        text
          .split('')
          .map((ch, i) => (i < settled || ch === ' ' ? ch : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]))
          .join(''),
      )
      if (frame >= total) {
        window.clearInterval(id)
        setShown(text)
      }
    }, 28)
    return () => window.clearInterval(id)
  }, [text])
  return shown
}

function Icon({ code }: { code: string }) {
  return <span className="icon" aria-hidden="true">{String.fromCodePoint(parseInt(code, 16))}</span>
}

function Pips({ n }: { n: number }) {
  return (
    <span className="pips" aria-hidden="true">
      {PLAYER_COLORS.slice(0, Math.min(4, Math.max(1, n))).map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
  )
}

// The prototype has no install state yet: a mod shows "Not installed", a Flash game "Ready", a page we only link to nothing.
const statusOf = (g: Game) => (g.mod ? 'Not installed' : g.online ? 'Ready' : '')

function Card({ game, selected, onSelect }: { game: Game; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`card ${selected ? 'selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <Cover game={game} />
      <div className="card-body">
        <div className="card-title">{game.name}</div>
        <div className="card-meta">
          <Pips n={game.maxPlayers ?? 2} />
          <span>{game.players}</span>
        </div>
        {statusOf(game) && <div className={`card-status ${game.mod ? '' : 'ready'}`}>{statusOf(game)}</div>}
      </div>
    </button>
  )
}

function Details({ game }: { game: Game }) {
  const title = useDecode(game.name)
  const slots = Math.min(4, game.maxPlayers ?? 2)
  const primary = game.mod ? `Install ${game.name}` : 'Play online'
  const sub = game.mod ? 'Into your game folder' : 'Opens Ruffle Together'
  const cats = data.categories.filter((c) => game.categories?.includes(c.id) && c.group === 'platform')
  return (
    <aside className="details" key={game.id}>
      <Cover game={game} className="details-cover" />
      <h2 className="details-title" aria-label={game.name}>{title}</h2>
      <div className="details-sub">{cats.map((c) => c.name).join(', ')}</div>
      <div className="slots" aria-label={`${slots} player slots`}>
        {Array.from({ length: slots }, (_, i) => (
          <div className="slot" key={i} style={{ ['--p' as string]: PLAYER_COLORS[i] }}>P{i + 1}</div>
        ))}
      </div>
      <p className="details-text">{game.description}</p>
      <div className="actions">
        {(game.mod || game.online) && (
          <button className="btn primary">
            <span className="btn-main">{primary}</span>
            <span className="btn-sub">{sub}</span>
          </button>
        )}
        {game.actions
          .filter((a) => a.link)
          .map((a) => (
            <a className="btn link" key={a.id} href={a.link} target="_blank" rel="noreferrer">
              <span className="btn-main">{a.label}</span>
              {a.description && <span className="btn-sub">{a.description}</span>}
            </a>
          ))}
        <div className="row">
          <button className="btn quiet">Favorite</button>
          <button className="btn quiet">Guide</button>
          <button className="btn quiet">Folder</button>
        </div>
      </div>
    </aside>
  )
}

export default function App() {
  const [cat, setCat] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [selId, setSelId] = useState<string>(data.games[0].id)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: data.games.length }
    for (const c of data.categories) m[c.id] = data.games.filter((g) => g.categories?.includes(c.id)).length
    return m
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.games.filter(
      (g) => (cat === 'all' || g.categories?.includes(cat)) && (!q || g.name.toLowerCase().includes(q)),
    )
  }, [cat, query])

  const selected = data.games.find((g) => g.id === selId) ?? data.games[0]
  const platform = data.categories.filter((c) => c.group === 'platform')
  const kind = data.categories.filter((c) => c.group === 'kind')

  const navItem = (id: string, name: string, icon: string) => (
    <button key={id} className={`nav ${cat === id ? 'active' : ''}`} onClick={() => setCat(id)}>
      <Icon code={icon} />
      <span className="nav-name">{name}</span>
      <span className="nav-count">{counts[id]}</span>
    </button>
  )

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-title">{data.branding.title}</div>
          <div className="brand-sub">{data.branding.subtitle}</div>
        </div>
        {navItem('all', 'All games', 'E80F')}
        <div className="nav-gap" />
        {platform.map((c) => navItem(c.id, c.name, c.icon))}
        <div className="nav-gap" />
        {kind.map((c) => navItem(c.id, c.name, c.icon))}
        <div className="nav-spacer" />
        <button className="nav"><Icon code="E713" /><span className="nav-name">Settings</span></button>
      </nav>
      <main className="main">
        <div className="search">
          <Icon code="E721" />
          <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games  (Ctrl+F)" />
        </div>
        <div className="grid">
          {shown.map((g) => (
            <Card key={g.id} game={g} selected={g.id === selected.id} onSelect={() => setSelId(g.id)} />
          ))}
          {shown.length === 0 && <div className="empty">No games match.</div>}
        </div>
      </main>
      <Details game={selected} />
      <footer className="status">
        <span className="dot" /> Server online (prototype data) <span className="sep" /> Prototype: not connected to the real launcher
      </footer>
    </div>
  )
}
