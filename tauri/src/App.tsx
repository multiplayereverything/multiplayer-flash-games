import { useEffect, useMemo, useRef, useState } from 'react'
import raw from './launcher.data.json'
import { Cover } from './Cover'
import { GamePage } from './GamePage'
import { COMING_SOON, PLAYED_HOURS_AGO, PLAYER_COLORS, agoText, leadAction, platformBadge, statusOf } from './mock'
import { usePad } from './usePad'
import type { Game, LauncherData } from './types'
import './App.css'

const data = raw as unknown as LauncherData

function Icon({ code }: { code: string }) {
  return <span className="icon" aria-hidden="true">{String.fromCodePoint(parseInt(code, 16))}</span>
}

function Pips({ n }: { n: number }) {
  return (
    <span className="pips" aria-hidden="true">
      {PLAYER_COLORS.slice(0, Math.min(6, Math.max(1, n))).map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  )
}

// A chip that opens a list (Quiver's "All" menu): the choice at the left, a chevron at the right.
function ChipMenu<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: { id: T; name: string }[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.id === value)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className="chip-menu" ref={root}>
      <button className="chip-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${current?.name}`} onClick={() => setOpen(!open)}>
        <span>{current?.name}</span>
        <Icon code="E70D" />
      </button>
      {open && (
        <div className="menu" role="menu">
          {options.map((o) => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={o.id === value}
              className="menu-item"
              onClick={() => {
                onChange(o.id)
                setOpen(false)
              }}
            >
              <span className="check">{o.id === value ? '✓' : ''}</span>
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// A poster: the picture is the card, the names sit over its foot. On hover or focus a Play button appears;
// the card itself opens the game's page.
function Card({ game, favorite, onOpen }: { game: Game; favorite: boolean; onOpen: () => void }) {
  const st = statusOf(game)
  const badge = platformBadge(game)
  const lead = leadAction(game)
  // What wants doing shows at the foot's right; a ready game shows nothing there.
  const note = st.kind === 'ready' || st.kind === 'installed' ? '' : st.text
  return (
    <div className="poster">
      <button className="poster-open" onClick={onOpen} aria-label={`${game.name}, ${game.players ?? ''}`}>
        <Cover game={game} className="fill" />
        <span className="poster-shade" />
        {badge && <span className="badge">{badge}</span>}
        {favorite && <span className="fav icon" aria-label="Favorite">{''}</span>}
        <span className="poster-foot">
          <span className="poster-title">{game.name}</span>
          <span className="poster-meta">
            <Pips n={game.maxPlayers ?? 2} />
            <span className="poster-players">{game.players?.replace(/ \(.*\)$/, '')}</span>
            {note && <span className={`note ${st.kind}`}>{note}</span>}
          </span>
        </span>
      </button>
      {lead && !game.mod && (
        <button className="poster-play" aria-label={`${lead.label}: ${game.name}`}>
          <Icon code="E768" /> {lead.label}
        </button>
      )}
    </div>
  )
}

// The most recently played game, wide, with Play and Open.
function Hero({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const lead = leadAction(game)
  return (
    <section className="hero" aria-label="Continue playing">
      <Cover game={game} className="fill" />
      <div className="hero-shade" />
      <div className="hero-body">
        <div className="hero-top">
          <span className="chip">Continue playing</span>
          <span className="hero-when">Played {agoText(PLAYED_HOURS_AGO[game.id])}</span>
        </div>
        <h3>{game.name}</h3>
        <div className="hero-row">
          {lead && !game.mod && <button className="btn primary hero-btn"><Icon code="E768" /> {lead.label}</button>}
          <button className="btn hero-btn" onClick={onOpen}>Open</button>
        </div>
      </div>
    </section>
  )
}

const VIEWS: { id: string; name: string }[] = [
  { id: 'favorites', name: 'Favorites' },
  { id: 'ready', name: 'Ready to play' },
  { id: 'soon', name: 'Coming soon' },
]
type Sort = 'ours' | 'recent' | 'name' | 'players'
const SORTS: { id: Sort; name: string }[] = [
  { id: 'ours', name: 'Our order' },
  { id: 'recent', name: 'Recently played' },
  { id: 'name', name: 'Name' },
  { id: 'players', name: 'Most players' },
]

function Hint({ k, label }: { k: string; label: string }) {
  return <span className="hint"><kbd>{k}</kbd>{label}</span>
}

export default function App() {
  const [top, setTop] = useState<'library' | 'rooms'>('library')
  const [view, setView] = useState<string>('flash')
  const [sort, setSort] = useState<Sort>('ours')
  const [compact, setCompact] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<{ id: string } | null>(null)
  // Which way the content moves on the last page change: a game's page in from the right, the library back from the left.
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [favs, setFavs] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('favs') ?? '[]'))
    } catch {
      return new Set()
    }
  })
  const search = useRef<HTMLInputElement>(null)

  const open = (id: string) => {
    setDir('in')
    setPage({ id })
  }
  const back = () => {
    if (!page) return
    setDir('out')
    setPage(null)
  }
  const focusSearch = () => {
    if (page) back()
    setTop('library')
    requestAnimationFrame(() => search.current?.focus())
  }

  const pad = usePad({
    back,
    search: focusSearch,
    prevTab: () => setTop('library'),
    nextTab: () => setTop('rooms'),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        focusSearch()
      } else if (e.key === 'Escape' && page && !(e.target instanceof HTMLInputElement)) back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
    return !!g.categories?.includes(v) && !COMING_SOON.has(g.id)
  }

  const viewOptions = useMemo(
    () =>
      [...data.categories.filter((c) => c.group === 'platform'), ...VIEWS, ...data.categories.filter((c) => c.group !== 'platform')].map((c) => ({
        id: c.id,
        name: `${c.name} (${data.games.filter((g) => inView(g, c.id)).length})`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [favs],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = data.games.filter((g) => inView(g, view) && (!q || g.name.toLowerCase().includes(q)))
    const order = new Map(data.games.map((g, i) => [g.id, i]))
    const key: Record<Sort, (g: Game) => number | string> = {
      ours: (g) => order.get(g.id) ?? 0,
      recent: (g) => PLAYED_HOURS_AGO[g.id] ?? Infinity,
      name: (g) => g.name.toLowerCase(),
      players: (g) => -(g.maxPlayers ?? 0),
    }
    return [...list].sort((a, b) => {
      const x = key[sort](a)
      const y = key[sort](b)
      return x < y ? -1 : x > y ? 1 : (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, query, favs, sort])

  const recent = Object.entries(PLAYED_HOURS_AGO).sort((a, b) => a[1] - b[1])[0]?.[0]
  const hero = !query && top === 'library' ? data.games.find((g) => g.id === recent) : undefined
  const pageGame = page ? data.games.find((g) => g.id === page.id) : undefined

  const hints = pad
    ? pageGame
      ? [['A', 'Press'], ['D-pad', 'Move'], ['B', 'Back']]
      : [['A', 'Open'], ['D-pad', 'Move'], ['Y', 'Search'], ['LB / RB', 'Library, Rooms']]
    : pageGame
      ? [['Esc', 'Back'], ['Tab', 'Next control']]
      : [['Enter', 'Open'], ['Ctrl+F', 'Search'], ['Tab', 'Next control']]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">{data.branding.title}</div>
        <nav className="toptabs" role="tablist">
          {(['library', 'rooms'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={top === t && !pageGame}
              className={`toptab ${top === t ? 'on' : ''}`}
              onClick={() => {
                back()
                setTop(t)
              }}
            >
              {t === 'library' ? 'Library' : 'Rooms'}
            </button>
          ))}
        </nav>
        <div className="grow" />
        <button className="ghost"><Icon code="E713" /> Settings</button>
      </header>

      <main className="body">
        {pageGame ? (
          <GamePage
            key={pageGame.id}
            game={pageGame}
            categories={data.categories}
            favorite={favs.has(pageGame.id)}
            onFavorite={() => toggleFav(pageGame.id)}
            onBack={back}
            dir={dir}
          />
        ) : top === 'rooms' ? (
          <div className={`library enter-${dir === 'in' ? 'right' : 'left'}`} key="rooms">
            <div className="empty">No open rooms right now. Rooms hosted through the launcher appear here.</div>
          </div>
        ) : (
          <div className={`library enter-${dir === 'in' ? 'right' : 'left'}`} key="library">
            {hero && <Hero game={hero} onOpen={() => open(hero.id)} />}
            <div className="toolbar">
              <ChipMenu label="Show" value={view} options={viewOptions} onChange={setView} />
              <label className="search">
                <Icon code="E721" />
                <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games  (Ctrl+F)" />
              </label>
              <ChipMenu label="Order" value={sort} options={SORTS} onChange={setSort} />
              <button className="chip-btn" onClick={() => setCompact(!compact)} aria-pressed={compact}>
                <Icon code="E8A9" /> {compact ? 'Larger' : 'Compact'}
              </button>
            </div>
            <div className={`grid ${compact ? 'compact' : ''}`}>
              {shown.map((g) => (
                <Card key={g.id} game={g} favorite={favs.has(g.id)} onOpen={() => open(g.id)} />
              ))}
              {shown.length === 0 && <div className="empty">{view === 'favorites' ? 'No favorites yet. Press Favorite on a game.' : 'No games match.'}</div>}
            </div>
          </div>
        )}
      </main>

      <footer className="status">
        {hints.map(([k, label]) => <Hint key={k} k={k} label={label} />)}
        <span className="grow" />
        <span className="dot" /> Server online (140 ms)
        <span className="sep" /> Ruffle Together <span className="ok">{'✓'}</span>
        <span className="sep" /> Prototype data
      </footer>
    </div>
  )
}
