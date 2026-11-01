import { useEffect, useMemo, useRef, useState } from 'react'
import raw from './launcher.data.json'
import { Cover } from './Cover'
import { COMING_SOON, platformBadge, statusOf } from './mock'
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

// Views in the sidebar that are not a category of launcher.json.
const VIEWS: Record<string, string> = { favorites: 'Favorites', ready: 'Ready to play', rooms: 'Rooms', soon: 'Coming soon' }
const VIEW_ICONS: Record<string, string> = { favorites: 'E734', ready: 'E768', rooms: 'E902', soon: 'E916' }

function Card({
  game, selected, favorite, onSelect,
}: { game: Game; selected: boolean; favorite: boolean; onSelect: () => void }) {
  const st = statusOf(game)
  const badge = platformBadge(game)
  return (
    <button className={`card ${selected ? 'selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <div className="card-art">
        <Cover game={game} />
        {badge && <span className="badge">{badge}</span>}
        {favorite && <span className="fav icon" aria-label="Favorite">{'\uE735'}</span>}
      </div>
      <div className="card-body">
        <div className="card-title">{game.name}</div>
        <div className="card-meta">
          <Pips n={game.maxPlayers ?? 2} />
          <span>{game.players}</span>
        </div>
        {st.text && <div className={`card-status ${st.kind}`}>{st.text}</div>}
      </div>
    </button>
  )
}

// Quiver's wide banner, for our case: the first game in the view that has real art.
function Hero({ game, onSelect }: { game: Game; onSelect: () => void }) {
  const st = statusOf(game)
  return (
    <section className="hero" aria-label="Featured">
      <img src={game.image} alt="" style={{ objectPosition: `50% ${(game.imageFocus ?? 0.3) * 100}%` }} draggable={false} />
      <div className="hero-shade" />
      <div className="hero-body">
        <span className="chip">Featured</span>
        <h3>{game.name}</h3>
        <p>{game.description}</p>
        <div className="hero-row">
          <button className="btn primary hero-btn" onClick={onSelect}>
            <span className="btn-main">{game.mod ? 'See details' : 'Play online'}</span>
          </button>
          <span className="hero-meta"><Pips n={game.maxPlayers ?? 2} /> {game.players}{st.text ? `  -  ${st.text}` : ''}</span>
        </div>
      </div>
    </section>
  )
}

function Details({ game, favorite, onFavorite }: { game: Game; favorite: boolean; onFavorite: () => void }) {
  const title = useDecode(game.name)
  const slots = Math.min(4, game.maxPlayers ?? 2)
  const st = statusOf(game)
  const soon = st.kind === 'soon'
  const hasPlay = !soon && (game.mod || game.online)
  let primary = 'Play online'
  let sub = 'Opens Ruffle Together'
  if (game.mod) {
    primary = st.kind === 'installed' ? `Launch ${game.mod.gameName}` : `Install ${game.mod.gameName}`
    sub = st.kind === 'installed' ? 'Starts the game with the mod' : `Version ${game.mod.version ?? 'latest'}, into your ${game.mod.gameName} folder`
  }
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
      {st.text && <div className={`pill ${st.kind}`}><i />{st.text}</div>}
      <p className="details-text">{game.description}</p>
      <div className="played">Not played yet</div>
      <div className="actions">
        {soon && <div className="soon-note">Not playable yet: this mod is still being built.</div>}
        {hasPlay && (
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
          <button className="btn quiet" onClick={onFavorite} aria-pressed={favorite}>
            <span className="icon">{favorite ? '\uE735' : '\uE734'}</span> Favorite
          </button>
          <button className="btn quiet">Guide</button>
          <button className="btn quiet">Folder</button>
        </div>
      </div>
    </aside>
  )
}

export default function App() {
  const [view, setView] = useState<string>('pc')
  const [query, setQuery] = useState('')
  const [selId, setSelId] = useState<string>(data.games[0].id)
  const [favs, setFavs] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('favs') ?? '[]'))
    } catch {
      return new Set()
    }
  })
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

  const toggleFav = (id: string) =>
    setFavs((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      try {
        localStorage.setItem('favs', JSON.stringify([...next]))
      } catch { /* the prototype works without storage */ }
      return next
    })

  const inView = (g: Game, v: string) => {
    if (v === 'favorites') return favs.has(g.id)
    if (v === 'ready') return statusOf(g).kind === 'ready' || statusOf(g).kind === 'installed'
    if (v === 'soon') return COMING_SOON.has(g.id)
    if (v === 'rooms') return false
    return !!g.categories?.includes(v)
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const id of [...data.categories.map((c) => c.id), ...Object.keys(VIEWS)])
      m[id] = data.games.filter((g) => inView(g, id)).length
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favs])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.games.filter((g) => inView(g, view) && (!q || g.name.toLowerCase().includes(q)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, query, favs])

  const selected = data.games.find((g) => g.id === selId) ?? data.games[0]
  const hero = !query && view !== 'rooms' ? shown.find((g) => g.image) : undefined
  const platform = data.categories.filter((c) => c.group === 'platform')
  const kind = data.categories.filter((c) => c.group === 'kind')

  const navItem = (id: string, name: string, icon: string) => (
    <button key={id} className={`nav ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
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
        {platform.map((c) => navItem(c.id, c.name, c.icon))}
        {(['favorites', 'ready', 'rooms', 'soon'] as const).map((id) => navItem(id, VIEWS[id], VIEW_ICONS[id]))}
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
        <div className="scroll">
          {hero && <Hero game={hero} onSelect={() => setSelId(hero.id)} />}
          {view === 'rooms' ? (
            <div className="empty">No open rooms right now. Rooms hosted through the launcher appear here.</div>
          ) : (
            <div className="grid">
              {shown.filter((g) => g !== hero).map((g) => (
                <Card key={g.id} game={g} selected={g.id === selected.id} favorite={favs.has(g.id)} onSelect={() => setSelId(g.id)} />
              ))}
              {shown.length === 0 && <div className="empty">{view === 'favorites' ? 'No favorites yet. Press Favorite on a game.' : 'No games match.'}</div>}
            </div>
          )}
        </div>
      </main>
      <Details game={selected} favorite={favs.has(selected.id)} onFavorite={() => toggleFav(selected.id)} />
      <footer className="status">
        <span className="dot" /> Server online (140 ms)
        <span className="sep" /> Ruffle Together <span className="ok">{'\u2713'}</span>
        <span className="sep" /> Flashpoint: E:\Flashpoint
        <span className="grow" />
        <span className="proto">Prototype data</span>
      </footer>
    </div>
  )
}
