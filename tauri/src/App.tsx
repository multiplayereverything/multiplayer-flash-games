import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Cover } from './Cover'
import { GamePage, type PageActions } from './GamePage'
import {
  launch, live, loadLibrary, loadMods, loadRooms, modJob, onLaunchEnded, onModProgress, setFavorite,
  type Game, type Library, type ModInfo, type Room,
} from './api'
import { agoText, joinByCode, lastPlayed, leadAction, platformBadge, statusOf } from './model'
import { usePad } from './usePad'
import './App.css'

function Icon({ code }: { code: string }) {
  return <span className="icon" aria-hidden="true">{String.fromCodePoint(parseInt(code, 16))}</span>
}

function Pips({ n, colors }: { n: number; colors: string[] }) {
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: Math.min(6, Math.max(1, n)) }, (_, i) => <i key={i} style={{ background: colors[i % colors.length] }} />)}
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
            <button key={o.id} role="menuitemradio" aria-checked={o.id === value} className="menu-item"
              onClick={() => { onChange(o.id); setOpen(false) }}>
              <span className="check">{o.id === value ? '✓' : ''}</span>
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface CardProps {
  game: Game
  lib: Library
  mods: Record<string, ModInfo> | null
  playing: boolean
  favorite: boolean
  onOpen: () => void
  onPlay: () => void
}

// A poster: the picture is the card, the names sit over its foot. On hover or focus a Play button appears;
// the card itself opens the game's page.
function Card({ game, lib, mods, playing, favorite, onOpen, onPlay }: CardProps) {
  const st = statusOf(game, lib, mods, playing)
  const badge = platformBadge(game)
  const lead = leadAction(game)
  // What wants doing shows at the foot's right; a ready game shows nothing there.
  const note = st.kind === 'ready' || st.kind === 'installed' ? '' : st.text
  return (
    <div className="poster">
      <button className="poster-open" onClick={onOpen} aria-label={`${game.name}, ${game.players}`}>
        <Cover game={game} className="fill" />
        <span className="poster-shade" />
        {badge && <span className="badge">{badge}</span>}
        {favorite && <span className="fav icon" aria-label="Favorite">{''}</span>}
        <span className="poster-foot">
          <span className="poster-title">{game.name}</span>
          <span className="poster-meta">
            <Pips n={game.maxPlayers} colors={lib.branding.playerColors} />
            <span className="poster-players">{game.players.replace(/ \(.*\)$/, '')}</span>
            {note && <span className={`note ${st.kind}`}>{note}</span>}
          </span>
        </span>
      </button>
      {lead && lead.state === 'ready' && (
        <button className="poster-play" aria-label={`${lead.label}: ${game.name}`} onClick={onPlay}>
          <Icon code="E768" /> {lead.label}
        </button>
      )}
    </div>
  )
}

// The most recently played game, wide, with Play and Open.
function Hero({ game, when, onOpen, onPlay }: { game: Game; when: number; onOpen: () => void; onPlay: () => void }) {
  const lead = leadAction(game)
  return (
    <section className="hero" aria-label="Continue playing">
      <Cover game={game} className="fill" />
      <div className="hero-shade" />
      <div className="hero-body">
        <div className="hero-top">
          <span className="chip">Continue playing</span>
          <span className="hero-when">Played {agoText(when)}</span>
        </div>
        <h3>{game.name}</h3>
        <div className="hero-row">
          {lead && lead.state === 'ready' && <button className="btn primary hero-btn" onClick={onPlay}><Icon code="E768" /> {lead.label}</button>}
          <button className="btn hero-btn" onClick={onOpen}>Open</button>
        </div>
      </div>
    </section>
  )
}

// Every online game's open rooms, with Join.
function RoomsPage({ lib, onJoin }: { lib: Library; onJoin: (g: Game, code: string) => void }) {
  const online = useMemo(() => lib.games.filter((g) => g.onlineId && !g.comingSoon), [lib])
  const [rooms, setRooms] = useState<{ game: Game; room: Room }[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const get = async () => {
      const all = await Promise.all(online.map((g) => loadRooms(g.id).then((r) => r.rooms.map((room) => ({ game: g, room }))).catch((e) => (setError(String(e)), []))))
      if (alive) setRooms(all.flat())
    }
    get()
    const id = window.setInterval(get, 20000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [online])
  return (
    <div className="rooms-page">
      <h2>Open rooms</h2>
      {!rooms && <p className="muted">Asking the central server...</p>}
      {rooms?.length === 0 && <p className="muted">{error || 'No open rooms right now. Host one from a game\'s page and friends see it here.'}</p>}
      <div className="room-list">
        {rooms?.map(({ game, room }) => (
          <div className="room" key={game.id + room.code}>
            <div className="room-art"><Cover game={game} className="fill" /></div>
            <div className="room-text">
              <strong>{room.name || game.name}</strong>
              <span className="muted">{game.name}  {room.code}  {room.players}/{room.max} players</span>
            </div>
            <button className="btn center" disabled={room.players >= room.max} onClick={() => onJoin(game, room.code)}>{room.players >= room.max ? 'Full' : 'Join'}</button>
          </div>
        ))}
      </div>
    </div>
  )
}

const VIEWS = [
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

interface Notice { text: string; kind: 'ok' | 'error' | 'info' }

export default function App() {
  const [lib, setLib] = useState<Library | null>(null)
  const [loadError, setLoadError] = useState('')
  const [mods, setMods] = useState<Record<string, ModInfo> | null>(null)
  const [top, setTop] = useState<'library' | 'rooms'>('library')
  const [view, setView] = useState<string>('flash')
  const [sort, setSort] = useState<Sort>('ours')
  const [compact, setCompact] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<string | null>(null)
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [favs, setFavs] = useState<Set<string>>(new Set())
  // Games started from here whose launcher is still running (a host keeps it up until the game closes).
  const [playing, setPlaying] = useState<Map<number, string>>(new Map())
  // A mod job's latest progress line, per game, while it runs.
  const [modLines, setModLines] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  const search = useRef<HTMLInputElement>(null)

  const say = useCallback((text: string, kind: Notice['kind'] = 'info') => setNotice({ text, kind }), [])

  const refresh = useCallback(async () => {
    try {
      const l = await loadLibrary()
      setLib(l)
      setFavs(new Set(Object.entries(l.user.games).filter(([, s]) => s.favorite).map(([id]) => id)))
    } catch (e) {
      setLoadError(String(e))
    }
  }, [])
  const refreshMods = useCallback(() => loadMods().then(setMods).catch((e) => say(`Mods: ${e}`, 'error')), [say])

  useEffect(() => {
    refresh()
    refreshMods()
  }, [refresh, refreshMods])

  useEffect(() => {
    const a = onLaunchEnded((e) => {
      setPlaying((p) => {
        const n = new Map(p)
        n.delete(e.session)
        return n
      })
      if (e.code !== 0) say(e.message || `The launcher stopped (exit ${e.code})`, 'error')
      refresh()  // play counts and last played
    })
    const b = onModProgress((e) => {
      if (!e.done) {
        setModLines((m) => ({ ...m, [e.game]: e.line }))
        return
      }
      setModLines((m) => {
        const n = { ...m }
        delete n[e.game]
        return n
      })
      say(e.ok ? 'Done.' : e.line || 'The mod job failed.', e.ok ? 'ok' : 'error')
      refreshMods()
    })
    return () => {
      a.then((f) => f())
      b.then((f) => f())
    }
  }, [refresh, refreshMods, say])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), notice.kind === 'error' ? 9000 : 4000)
    return () => window.clearTimeout(id)
  }, [notice])

  const actions: PageActions = {
    run: (game, action, code, address) => {
      if (action.state && action.state !== 'ready') {
        say(`${game.name}: ${action.state === 'noFile' ? 'the game file is missing' : action.state === 'noPlayer' ? 'no Flash player found' : 'its server program is missing'}.`, 'error')
        return
      }
      launch(game.id, action.id, code, address)
        .then((session) => {
          setPlaying((p) => new Map(p).set(session, game.id))
          say(code ? `Joining room ${code} in ${game.name}...` : `Starting ${game.name}...`, 'ok')
        })
        .catch((e) => say(String(e), 'error'))
    },
    modOp: (game, op) => {
      setModLines((m) => ({ ...m, [game.id]: 'Starting' }))
      modJob(op, game.id).catch((e) => {
        setModLines((m) => {
          const n = { ...m }
          delete n[game.id]
          return n
        })
        say(String(e), 'error')
      })
    },
  }

  const open = (id: string) => {
    setDir('in')
    setPage(id)
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
  const toggleFav = (id: string) => {
    const on = !favs.has(id)
    setFavs((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
    setFavorite(id, on).catch((e) => say(String(e), 'error'))
  }

  const pad = usePad({ back, search: focusSearch, prevTab: () => setTop('library'), nextTab: () => setTop('rooms') })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        focusSearch()
      } else if (e.key === 'Escape' && page && !(e.target instanceof HTMLInputElement)) back()
      else if (e.key === 'F5') {
        e.preventDefault()
        refresh()
        refreshMods()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const playingIds = useMemo(() => new Set(playing.values()), [playing])

  const inView = useCallback(
    (g: Game, v: string) => {
      if (!lib) return false
      if (v === 'favorites') return favs.has(g.id)
      if (v === 'ready') return ['ready', 'installed', 'update'].includes(statusOf(g, lib, mods, false).kind)
      if (v === 'soon') return g.comingSoon
      return g.categories.includes(v) && !g.comingSoon
    },
    [lib, mods, favs],
  )

  const viewOptions = useMemo(() => {
    if (!lib) return []
    const platform = lib.categories.filter((c) => c.group === 'platform')
    const rest = lib.categories.filter((c) => c.group !== 'platform')
    return [...platform, ...VIEWS, ...rest].map((c) => ({ id: c.id, name: `${c.name} (${lib.games.filter((g) => inView(g, c.id)).length})` }))
  }, [lib, inView])

  const shown = useMemo(() => {
    if (!lib) return []
    const q = query.trim().toLowerCase()
    const list = lib.games.filter((g) => inView(g, view) && (!q || g.name.toLowerCase().includes(q)))
    const order = new Map(lib.games.map((g, i) => [g.id, i]))
    const key: Record<Sort, (g: Game) => number | string> = {
      ours: (g) => order.get(g.id) ?? 0,
      recent: (g) => -lastPlayed(lib, g.id),
      name: (g) => g.name.toLowerCase(),
      players: (g) => -g.maxPlayers,
    }
    return [...list].sort((a, b) => {
      const x = key[sort](a)
      const y = key[sort](b)
      return x < y ? -1 : x > y ? 1 : (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    })
  }, [lib, view, query, sort, inView])

  if (!lib) {
    return (
      <div className="loading">
        {loadError ? (
          <>
            <h2>The library couldn't be read</h2>
            <p>{loadError}</p>
            <button className="btn center" onClick={() => { setLoadError(''); refresh() }}>Try again</button>
          </>
        ) : (
          <p className="muted">Reading the library...</p>
        )}
      </div>
    )
  }

  const recent = lib.games.filter((g) => !g.comingSoon && lastPlayed(lib, g.id) > 0).sort((a, b) => lastPlayed(lib, b.id) - lastPlayed(lib, a.id))[0]
  const hero = !query && top === 'library' ? recent : undefined
  const pageGame = page ? lib.games.find((g) => g.id === page) : undefined
  const playLead = (g: Game) => {
    const a = leadAction(g)
    if (a) actions.run(g, a)
  }

  const hints = pad
    ? pageGame
      ? [['A', 'Press'], ['D-pad', 'Move'], ['B', 'Back']]
      : [['A', 'Open'], ['D-pad', 'Move'], ['Y', 'Search'], ['LB / RB', 'Library, Rooms']]
    : pageGame
      ? [['Esc', 'Back'], ['Tab', 'Next control']]
      : [['Enter', 'Open'], ['Ctrl+F', 'Search'], ['F5', 'Refresh']]
  const ruffle = lib.players.find((p) => p.id === 'ruffle') ?? lib.players[0]
  const playingNow = [...playingIds].map((id) => lib.games.find((g) => g.id === id)?.name).filter(Boolean)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">{lib.branding.title}</div>
        <nav className="toptabs" role="tablist">
          {(['library', 'rooms'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={top === t && !pageGame} className={`toptab ${top === t ? 'on' : ''}`}
              onClick={() => { back(); setTop(t) }}>
              {t === 'library' ? 'Library' : 'Rooms'}
            </button>
          ))}
        </nav>
        <div className="grow" />
        <button className="ghost" title="Settings open in the C++ launcher for now"><Icon code="E713" /> Settings</button>
      </header>

      <main className="body">
        {pageGame ? (
          <GamePage
            key={pageGame.id}
            game={pageGame}
            lib={lib}
            mods={mods}
            playing={playingIds.has(pageGame.id)}
            modLine={modLines[pageGame.id]}
            favorite={favs.has(pageGame.id)}
            onFavorite={() => toggleFav(pageGame.id)}
            onBack={back}
            dir={dir}
            actions={actions}
          />
        ) : top === 'rooms' ? (
          <div className={`library enter-${dir === 'in' ? 'right' : 'left'}`} key="rooms">
            <RoomsPage lib={lib} onJoin={(g, code) => { const a = joinByCode(g); if (a) actions.run(g, a, code) }} />
          </div>
        ) : (
          <div className={`library enter-${dir === 'in' ? 'right' : 'left'}`} key="library">
            {hero && <Hero game={hero} when={lastPlayed(lib, hero.id)} onOpen={() => open(hero.id)} onPlay={() => playLead(hero)} />}
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
                <Card key={g.id} game={g} lib={lib} mods={mods} playing={playingIds.has(g.id)} favorite={favs.has(g.id)}
                  onOpen={() => open(g.id)} onPlay={() => playLead(g)} />
              ))}
              {shown.length === 0 && <div className="empty">{view === 'favorites' ? 'No favorites yet. Press Favorite on a game.' : 'No games match.'}</div>}
            </div>
          </div>
        )}
        {notice && <div className={`toast ${notice.kind}`} role="status">{notice.text}</div>}
      </main>

      <footer className="status">
        {playingNow.length > 0 ? (
          <span className="playing"><span className="dot live" /> Playing {playingNow.join(', ')}</span>
        ) : (
          hints.map(([k, label]) => <Hint key={k} k={k} label={label} />)
        )}
        <span className="grow" />
        {ruffle && (<>{ruffle.name} <span className={ruffle.found ? 'ok' : 'warn'}>{ruffle.found ? '✓' : 'missing'}</span></>)}
        <span className="sep" /> {live ? `Player name: ${lib.user.playerName || 'not set'}` : 'Sample data (browser)'}
      </footer>
    </div>
  )
}
