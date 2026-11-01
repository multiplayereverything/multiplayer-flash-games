import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ChevronLeft, ChevronRight, Gamepad2, Home, LayoutGrid, Minus, PanelLeft, Play, Radio, Search, Settings as Cog,
  Square, Star, Users, X,
} from 'lucide-react'
import { Cover } from './Cover'
import { GamePage, type PageActions } from './GamePage'
import { LobbyPage } from './LobbyPage'
import { SettingsPage } from './SettingsPage'
import {
  downloadGame, launch, live, loadLibrary, loadMods, loadRooms, minimizeWindow, modJob, onDownloadEnded, onHostStatus,
  onLaunchEnded, onModProgress, pickFile, pickFolder, setFavorite, setGameDir, setGameFile, stopSession, windowControl,
  type Game, type Library, type ModInfo, type RelayStatus, type Room,
} from './api'
import { agoText, isCoop, joinByCode, lastPlayed, leadAction, playersShort, statusOf } from './model'
import { Picker, Pips, Seg, Shelf, Tile, Toggle } from './ui'
import { usePad } from './usePad'
import './App.css'

type View = 'home' | 'library' | 'rooms' | 'settings' | 'game' | 'lobby'
type Sort = 'ours' | 'recent' | 'name' | 'players'
const SORTS: { id: Sort; name: string }[] = [
  { id: 'ours', name: 'Our order' },
  { id: 'recent', name: 'Recent' },
  { id: 'name', name: 'A to Z' },
  { id: 'players', name: 'Most players' },
]

interface Notice { text: string; kind: 'ok' | 'error' | 'info' }

// The big banner on Home: a few games one after another, with dots and arrows.
function Slider({ games, lib, onOpen, onPlay }: { games: Game[]; lib: Library; onOpen: (g: Game) => void; onPlay: (g: Game) => void }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || games.length < 2) return
    const id = window.setTimeout(() => setI((n) => (n + 1) % games.length), 8000)
    return () => window.clearTimeout(id)
  }, [i, paused, games.length])
  if (!games.length) return null
  return (
    <section className="slider" aria-roledescription="carousel" aria-label="Featured" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {games.map((g, n) => {
        const lead = leadAction(g)
        const when = lastPlayed(lib, g.id)
        return (
          <div key={g.id} className={`slide ${n === i ? 'on' : ''}`} aria-hidden={n !== i}>
            <Cover game={g} className="bg" />
            <div className="sl-in">
              <span className="kick">{when ? `Played ${agoText(when)}` : g.mod ? 'PC game mod' : g.onlineId ? 'Play online' : 'Featured'}</span>
              <h2>{g.name}</h2>
              <span className="based">
                <Pips n={g.maxPlayers} colors={lib.branding.playerColors} />
                <span>{g.mod ? <>Mod for <b>{g.mod.gameName || g.name}</b></> : <b>{playersShort(g)}</b>}</span>
              </span>
              <p>{g.description}</p>
              <div className="acts">
                {lead?.state === 'ready' && <button className="btn main" tabIndex={n === i ? 0 : -1} onClick={() => onPlay(g)}><Play size={16} fill="currentColor" />{lead.label}</button>}
                <button className="btn" tabIndex={n === i ? 0 : -1} onClick={() => onOpen(g)}>Details</button>
              </div>
            </div>
            <div className="sl-cover"><Cover game={g} className="fill" tall /></div>
          </div>
        )
      })}
      {games.length > 1 && (
        <>
          <div className="sl-ui">
            {games.map((g, n) => <button key={g.id} className={`dot ${n === i ? 'on' : ''}`} aria-label={g.name} onClick={() => setI(n)} />)}
          </div>
          <div className="sl-arrows">
            <button aria-label="Previous" onClick={() => setI((i + games.length - 1) % games.length)}><ChevronLeft size={18} /></button>
            <button aria-label="Next" onClick={() => setI((i + 1) % games.length)}><ChevronRight size={18} /></button>
          </div>
        </>
      )}
    </section>
  )
}

// Every online game's open rooms, with Join.
function RoomsPage({ lib, onJoin, onOpen }: { lib: Library; onJoin: (g: Game, code: string) => void; onOpen: (g: Game) => void }) {
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
    <div className="page">
      <div className="head">
        <div>
          <h1>Open rooms</h1>
          <p>Rooms people are hosting on the central server right now. Join one, or host your own from a game's page.</p>
        </div>
      </div>
      {!rooms && <div className="loading">Asking the central server...</div>}
      {rooms?.length === 0 && (
        <div className="empty">
          <Radio size={40} />
          <h2>No open rooms right now</h2>
          <p>{error || 'Host one from a game\'s page and it shows up here for everyone.'}</p>
        </div>
      )}
      <div className="rows">
        {rooms?.map(({ game, room }) => (
          <div className="row-card" key={game.id + room.code}>
            <button className="th" onClick={() => onOpen(game)} aria-label={game.name}><Cover game={game} className="fill" /></button>
            <div className="k">
              <b>{room.name || game.name}</b>
              <small>{game.name}</small>
            </div>
            <span className="tag cy">{room.code}</span>
            <span className="num"><b>{room.players} of {room.max}</b><small>players</small></span>
            <button className="btn sm" disabled={room.players >= room.max} onClick={() => onJoin(game, room.code)}>{room.players >= room.max ? 'Full' : 'Join'}</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const [lib, setLib] = useState<Library | null>(null)
  const [loadError, setLoadError] = useState('')
  const [mods, setMods] = useState<Record<string, ModInfo> | null>(null)
  const [view, setView] = useState<View>('home')
  const [from, setFrom] = useState<View>('home')
  const [gameId, setGameId] = useState('')
  const [anim, setAnim] = useState('enter')
  const [cat, setCat] = useState('all')
  const [sort, setSort] = useState<Sort>('ours')
  const [favOnly, setFavOnly] = useState(false)
  const [readyOnly, setReadyOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [mini, setMini] = useState(false)
  const [favs, setFavs] = useState<Set<string>>(new Set())
  // Games started from here whose launcher is still running (a host keeps it up until the game closes).
  const [playing, setPlaying] = useState<Map<number, string>>(new Map())
  // A mod job's latest progress line, per game, while it runs.
  const [modLines, setModLines] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  // Hosting with the built-in relay, per game: the launcher session and what it last reported.
  const [hosting, setHosting] = useState<Record<string, { session: number; relay: RelayStatus }>>({})
  const [downloading, setDownloading] = useState<Set<string>>(new Set())
  const search = useRef<HTMLInputElement>(null)
  const main = useRef<HTMLElement>(null)

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
      setHosting((h) => {
        if (h[e.game]?.session !== e.session) return h
        const n = { ...h }
        delete n[e.game]
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
    const c = onHostStatus((e) => setHosting((h) => ({ ...h, [e.game]: { session: e.session, relay: e.relay } })))
    const d = onDownloadEnded((e) => {
      setDownloading((s) => {
        const n = new Set(s)
        n.delete(e.game)
        return n
      })
      say(e.ok ? 'The game files are downloaded.' : e.line || 'The download failed.', e.ok ? 'ok' : 'error')
      refresh()
    })
    return () => {
      for (const p of [a, b, c, d]) p.then((f) => f())
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
          if (lib?.user.minimize) void minimizeWindow()
        })
        .catch((e) => say(String(e), 'error'))
    },
    openLobby: (game) => go('lobby', game.id),
    stopHosting: (session) => {
      stopSession(session)
        .then(() => {
          setHosting((h) => Object.fromEntries(Object.entries(h).filter(([, v]) => v.session !== session)))
          setPlaying((p) => {
            const n = new Map(p)
            n.delete(session)
            return n
          })
          say('Hosting stopped.', 'info')
        })
        .catch((e) => say(String(e), 'error'))
    },
    download: (game) => {
      setDownloading((s) => new Set(s).add(game.id))
      downloadGame(game.id).catch((e) => {
        setDownloading((s) => {
          const n = new Set(s)
          n.delete(game.id)
          return n
        })
        say(String(e), 'error')
      })
    },
    locate: async (game, action) => {
      const file = await pickFile(`Where is the ${game.name} game file?`, ['swf', 'html', 'htm'])
      if (!file) return
      setGameFile(game.id, action.id, file)
        .then(refresh)
        .then(() => say(`${game.name} uses ${file}.`, 'ok'))
        .catch((e) => say(String(e), 'error'))
    },
    chooseFolder: async (game) => {
      const name = game.mod?.gameName || game.name
      const dir = await pickFolder(`Where is ${name} installed?`)
      if (!dir) return
      setGameDir(game.id, dir)
        .then(() => loadMods())
        .then((m) => {
          setMods(m)
          say(m[game.id]?.gameFound ? `${name} found in ${dir}.` : `${name} isn't in that folder.`, m[game.id]?.gameFound ? 'ok' : 'error')
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

  // Going somewhere draws the page fresh with its entrance; a game page rises, going back eases in from the left.
  function go(v: View, id = '') {
    if (v === 'game' || v === 'lobby') {
      if (view !== 'game' && view !== 'lobby') setFrom(view)
      setGameId(id)
      setAnim(v === 'game' ? 'enter-game' : 'enter')
    } else setAnim('enter')
    setView(v)
    main.current?.scrollTo({ top: 0 })
  }
  const back = () => {
    if (view !== 'game' && view !== 'lobby') return
    setAnim('enter-back')
    setView(view === 'lobby' ? 'game' : from)
  }
  const focusSearch = () => {
    go('library')
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

  const SECTIONS: View[] = ['home', 'library', 'rooms']
  const step = (d: number) => {
    const i = SECTIONS.indexOf(view)
    go(SECTIONS[(Math.max(0, i) + d + SECTIONS.length) % SECTIONS.length])
  }
  const pad = usePad({ back, search: focusSearch, prevTab: () => step(-1), nextTab: () => step(1) })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        focusSearch()
      } else if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) back()
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

  const catOptions = useMemo(() => {
    if (!lib) return []
    const count = (id: string) => lib.games.filter((g) => g.categories.includes(id)).length
    return [{ id: 'all', name: 'All' }, ...lib.categories.filter((c) => count(c.id) > 0).map((c) => ({ id: c.id, name: c.name }))]
  }, [lib])

  const shown = useMemo(() => {
    if (!lib) return []
    const q = query.trim().toLowerCase()
    const ready = (g: Game) => ['ready', 'installed', 'update'].includes(statusOf(g, lib, mods, false).kind)
    const list = lib.games.filter((g) =>
      (cat === 'all' || g.categories.includes(cat)) && (!favOnly || favs.has(g.id)) && (!readyOnly || ready(g)) &&
      (!q || g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q) || (g.mod?.gameName ?? '').toLowerCase().includes(q)))
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
  }, [lib, mods, cat, favOnly, readyOnly, favs, query, sort])

  if (!lib) {
    return (
      <div className="boot">
        {loadError ? (
          <>
            <h2>The library couldn't be read</h2>
            <p>{loadError}</p>
            <button className="btn main" onClick={() => { setLoadError(''); refresh() }}>Try again</button>
          </>
        ) : (
          <p>Reading the library...</p>
        )}
      </div>
    )
  }

  const playLead = (g: Game) => {
    const a = leadAction(g)
    if (a) actions.run(g, a)
  }
  const tileOf = (g: Game) => (
    <Tile key={g.id} game={g} lib={lib} mods={mods} playing={playingIds.has(g.id)} favorite={favs.has(g.id)}
      onOpen={() => go('game', g.id)} onPlay={() => playLead(g)} />
  )

  const playable = lib.games.filter((g) => !g.comingSoon)
  const recent = playable.filter((g) => lastPlayed(lib, g.id) > 0).sort((a, b) => lastPlayed(lib, b.id) - lastPlayed(lib, a.id))
  const featured = [...new Set([...recent.slice(0, 2), ...playable.filter((g) => g.image), ...playable])].slice(0, 5)
  const together = playable.filter((g) => g.onlineId || isCoop(g))
  const pcMods = playable.filter((g) => g.mod)
  const soon = lib.games.filter((g) => g.comingSoon)
  const pins = lib.games.filter((g) => favs.has(g.id))
  const pageGame = lib.games.find((g) => g.id === gameId)
  const words = lib.branding.title.split(' ')
  const side = view === 'game' || view === 'lobby' ? (pins.some((p) => p.id === gameId) ? '' : from) : view

  const nav = (v: View, label: string, icon: ReactNode, n?: number) => (
    <button className={`nav ${side === v ? 'on' : ''}`} onClick={() => go(v)} title={mini ? label : undefined} aria-current={side === v ? 'page' : undefined}>
      {icon}<span className="lbl">{label}</span>{n ? <span className="n">{n}</span> : null}
    </button>
  )

  let page: ReactNode
  if (view === 'settings') {
    page = (
      <SettingsPage lib={lib} onChanged={(s) => {
        setLib((l) => (l ? { ...l, user: { ...l.user, ...s } } : l))
        if ('gamesDir' in s || 'defaultPlayer' in s) refresh()  // file states depend on these
      }} />
    )
  } else if (view === 'lobby' && pageGame) {
    page = <LobbyPage game={pageGame} lib={lib} onClose={back} />
  } else if (view === 'game' && pageGame) {
    page = (
      <GamePage key={pageGame.id} game={pageGame} lib={lib} mods={mods} playing={playingIds.has(pageGame.id)}
        modLine={modLines[pageGame.id]} downloading={downloading.has(pageGame.id)} hosting={hosting[pageGame.id]}
        favorite={favs.has(pageGame.id)} onFavorite={() => toggleFav(pageGame.id)} onBack={back} actions={actions} />
    )
  } else if (view === 'rooms') {
    page = <RoomsPage lib={lib} onOpen={(g) => go('game', g.id)} onJoin={(g, code) => { const a = joinByCode(g); if (a) actions.run(g, a, code) }} />
  } else if (view === 'library') {
    page = (
      <div className="page">
        <div className="dhead">
          <h1>Library</h1>
          <p>{lib.branding.subtitle || 'Every game here plays with friends.'}</p>
          <label className="bigsearch">
            <Search size={20} />
            <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games and mods" spellCheck={false} />
            {query && <button className="clear" aria-label="Clear the search" onClick={() => setQuery('')}><X size={16} /></button>}
          </label>
        </div>
        <div className="dctl">
          <Seg label="Order" value={sort} options={SORTS} onChange={setSort} />
          <Picker label="Show" value={cat} options={catOptions} onChange={setCat} />
          <Toggle label="Favorites" on={favOnly} onChange={setFavOnly} icon={<Star size={15} />} />
          <Toggle label="Ready to play" on={readyOnly} onChange={setReadyOnly} icon={<span className="live-dot" />} />
        </div>
        <div className="count-line">{shown.length === 1 ? '1 game' : `${shown.length} games`}</div>
        {shown.length ? (
          <div className="grid">{shown.map(tileOf)}</div>
        ) : (
          <div className="empty">
            <Gamepad2 size={40} />
            <h2>Nothing matches</h2>
            <p>{favOnly && !favs.size ? 'No favorites yet. Open a game and press the star.' : 'Try another search, or turn a filter off.'}</p>
          </div>
        )}
      </div>
    )
  } else {
    page = (
      <div className="page">
        <Slider games={featured} lib={lib} onOpen={(g) => go('game', g.id)} onPlay={playLead} />
        {recent.length > 0 && <Shelf title="Jump back in" count={recent.length}>{recent.map(tileOf)}</Shelf>}
        {together.length > 0 && (
          <Shelf title="Play together online" note="Host a room and friends join with its code. No port forwarding." count={together.length} onSeeAll={() => go('library')}>
            {together.map(tileOf)}
          </Shelf>
        )}
        {pcMods.length > 0 && <Shelf title="PC game mods" note="Installed into your own copy of the game, and taken back out just as cleanly." count={pcMods.length}>{pcMods.map(tileOf)}</Shelf>}
        {soon.length > 0 && <Shelf title="Coming soon" count={soon.length}>{soon.map(tileOf)}</Shelf>}
      </div>
    )
  }

  const playingNow = [...playingIds].map((id) => lib.games.find((g) => g.id === id)).filter((g): g is Game => !!g)
  const jobs = Object.entries(modLines).map(([id, line]) => ({ game: lib.games.find((g) => g.id === id), line })).filter((j) => j.game)

  return (
    <div id="app">
      <aside className={`side ${mini ? 'mini' : ''}`}>
        <div className="brand">
          <button id="brand" onClick={() => go('home')} aria-label={lib.branding.title}>
            <span className="word lbl">{words[0]}<b>{words.slice(1).join(' ')}</b></span>
          </button>
        </div>
        <nav className="navs">
          {nav('home', 'Home', <Home size={20} />)}
          {nav('library', 'Library', <LayoutGrid size={20} />, lib.games.length)}
          {nav('rooms', 'Open rooms', <Radio size={20} />)}
        </nav>
        {pins.length > 0 && <div className="pins-h"><span className="lbl">Favorites</span></div>}
        <div className="pins">
          {pins.map((g) => (
            <button key={g.id} className={`pin ${view === 'game' && gameId === g.id ? 'on' : ''}`} onClick={() => go('game', g.id)} title={mini ? g.name : undefined}>
              <span className="th"><Cover game={g} className="fill" />{playingIds.has(g.id) && <span className="run" />}</span>
              <span className="lbl">{g.name}</span>
            </button>
          ))}
        </div>
        <div className="side-foot">
          <button className="nav" onClick={() => go('settings')} title={mini ? 'Your name' : undefined}>
            <span className="avatar">{(lib.user.playerName || '?').slice(0, 1).toUpperCase()}</span>
            <span className="lbl">{lib.user.playerName || 'Set your name'}</span>
          </button>
          {nav('settings', 'Settings', <Cog size={20} />)}
          <button className="nav" onClick={() => setMini(!mini)} aria-label={mini ? 'Expand the sidebar' : 'Collapse the sidebar'}>
            <PanelLeft size={20} /><span className="lbl">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="mainwrap">
        <div className="topbar" data-tauri-drag-region>
          {live && (
            <div className="win">
              <button aria-label="Minimize" onClick={() => windowControl('minimize')}><Minus size={16} /></button>
              <button aria-label="Maximize" onClick={() => windowControl('maximize')}><Square size={13} /></button>
              <button className="close" aria-label="Close" onClick={() => windowControl('close')}><X size={17} /></button>
            </div>
          )}
        </div>
        <main ref={main} className={anim} key={`${view}:${gameId}`}>
          {page}
        </main>
        {pad && view !== 'game' && (
          <div className="padbar" aria-hidden="true">
            <span><kbd>A</kbd>Select</span><span><kbd>B</kbd>Back</span><span><kbd>Y</kbd>Search</span><span><kbd>LB</kbd>+<kbd>RB</kbd>Sections</span>
          </div>
        )}
      </div>

      <div className="island" aria-live="polite">
        {jobs.map(({ game, line }) => (
          <div className="isl" key={game!.id}>
            <span className="th"><Cover game={game!} className="fill" /></span>
            <span className="k"><b>{game!.name}</b><small>{line}</small></span>
            <span className="ln busy" />
          </div>
        ))}
        {playingNow.map((g) => (
          <button className="isl" key={g.id} onClick={() => go('game', g.id)}>
            <span className="th"><Cover game={g} className="fill" /></span>
            <span className="k"><b>{hosting[g.id] ? `Hosting ${g.name}` : `Playing ${g.name}`}</b><small>{hosting[g.id] ? `${hosting[g.id].relay.peers.filter((p) => !p.host).length} joined` : 'The launcher keeps watch until it closes'}</small></span>
            {hosting[g.id] && <Users size={18} className="pc" />}
          </button>
        ))}
        {notice && (
          <div className={`isl note ${notice.kind}`} role="status">
            <span className="k"><b>{notice.text}</b></span>
          </div>
        )}
      </div>
    </div>
  )
}
