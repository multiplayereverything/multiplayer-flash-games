import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ChevronLeft, ChevronRight, Gamepad2, Minus, PanelLeft, Play, Radio, Search,
  Square, Users, X,
} from 'lucide-react'
import { Cover } from './Cover'
import { GamePage, type PageActions } from './GamePage'
import { LobbyPage } from './LobbyPage'
import { SettingsPage } from './SettingsPage'
import { SetupPage } from './SetupPage'
import {
  downloadGame, launch, live, loadLibrary, loadMods, loadAllRooms, minimizeWindow, modJob, ping, restoreWindow, updatePlayers, onDownloadEnded, onHostStatus,
  onLaunchEnded, onModProgress, pickFile, pickFolder, setFavorite, setGameDir, setGameFile, stopSession, windowControl,
  type Game, type Library, type ModInfo, type RelayStatus, type Room, type Rooms, type Settings,
} from './api'
import { agoText, isCoop, joinByCode, lastPlayed, leadAction, playersShort, statusOf } from './model'
import { Glyph, Pips, Seg, Shelf, Tile } from './ui'
import { moveFocus, usePad } from './usePad'
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

const stored = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A private or blocked store only means the choice isn't remembered.
  }
}

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
function RoomsPage({ lib, all, onJoin, onOpen }: { lib: Library; all: Record<string, Rooms> | null; onJoin: (g: Game, code: string) => void; onOpen: (g: Game) => void }) {
  // Games sharing one online id list the same rooms; each room shows once, under the first of them.
  const seen = new Set<string>()
  const rooms: { game: Game; room: Room }[] | null = all
    ? lib.games.flatMap((g) => (all[g.id]?.rooms ?? []).filter((r) => !seen.has(g.onlineId + r.code) && seen.add(g.onlineId + r.code)).map((room) => ({ game: g, room })))
    : null
  const error = all ? Object.values(all).find((x) => x.error)?.error ?? '' : ''
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
  // The list's category and order are this window's own conveniences, kept between runs like the C++ window keeps its own.
  const [cat, setCat] = useState(() => stored('fl.cat', 'all'))
  const [sort, setSort] = useState<Sort>(() => stored('fl.sort', 'ours') as Sort)
  useEffect(() => {
    keep('fl.cat', cat)
    keep('fl.sort', sort)
  }, [cat, sort])
  // The central server, as the C++ status bar shows it: asked once through a game's room list.
  const [server, setServer] = useState<'unknown' | 'checking' | 'online' | 'offline'>('unknown')
  const [pingMs, setPingMs] = useState<number | null>(null)
  const [allRooms, setAllRooms] = useState<Record<string, Rooms> | null>(null)
  // A game whose file is missing, opened from a Play outside its page: its page offers the download at once.
  const [askDownload, setAskDownload] = useState('')
  // The first-run setup: opens when the launcher starts without a player name (the C++ window asks for one then
  // too), decided once so saving the name doesn't close it, and again from Settings.
  const [setupOpen, setSetupOpen] = useState<boolean | null>(null)
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
      setSetupOpen((open) => open ?? !l.user.playerName)
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

  const anyOnline = !!lib?.user.online && !!lib?.games.some((g) => g.onlineId && !g.comingSoon)
  const roomsServer = lib?.roomsServer ?? ''
  useEffect(() => {
    if (!anyOnline) return
    let alive = true
    const ask = () => {
      setServer((s) => (s === 'unknown' ? 'checking' : s))
      loadAllRooms()
        .then((r) => {
          if (!alive) return
          setAllRooms(r.games)
          const answers = Object.values(r.games)
          setServer(answers.some((x) => x.onServer && !x.error) ? 'online' : 'offline')
          if (roomsServer) ping(roomsServer).then((ms) => alive && setPingMs(ms)).catch(() => alive && setPingMs(null))
        })
        .catch(() => alive && setServer('offline'))
    }
    ask()
    const id = window.setInterval(ask, 30000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [anyOnline, roomsServer])

  // Ruffle Together kept on its newest release, once per start, as the C++ launcher does: everyone in a co-op
  // session has to run the same build.
  const playersChecked = useRef(false)
  const autoUpdate = !!lib?.user.autoUpdate && !!lib?.user.online
  useEffect(() => {
    if (!autoUpdate || playersChecked.current) return
    playersChecked.current = true
    updatePlayers()
      .then((r) => {
        const done = r.players.filter((x) => x.updated)
        if (!done.length) return
        const names = done.map((x) => `${lib?.players.find((pl) => pl.id === x.id)?.name ?? x.id} ${x.version}`).join(', ')
        say((lib?.text['update.player'] ?? '${PLAYER} is installed.').replace('${PLAYER}', names), 'ok')
        refresh()
      })
      .catch(() => {})
  }, [autoUpdate, lib, refresh, say])

  // The launcher.json theme: the C++ light palette when it asks for one.
  const theme = lib?.theme ?? 'dark'
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
  }, [theme])

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
    run: (game, action, code, address, coopSave) => {
      if (action.state === 'noFile') {
        setAskDownload(game.id)
        go('game', game.id)
        return
      }
      if (action.state && action.state !== 'ready') {
        say(`${game.name}: ${action.state === 'noPlayer' ? 'no Flash player found' : 'its server program is missing'}.`, 'error')
        return
      }
      launch(game.id, action.id, code, address, coopSave)
        .then((session) => {
          setPlaying((p) => new Map(p).set(session, game.id))
          say(code ? `Joining room ${code} in ${game.name}...` : `Starting ${game.name}...`, 'ok')
          if (lib?.user.minimize) void minimizeWindow()
        })
        .catch((e) => say(String(e), 'error'))
    },
    openLobby: (game) => go('lobby', game.id),
    refresh: () => void refresh(),
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
    if (id !== askDownload) setAskDownload('')
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
      } else if (e.key.startsWith('Arrow') && e.target instanceof HTMLElement && e.target.closest('.card-c, .nav, .seg')) {
        e.preventDefault()
        moveFocus(e.key.slice(5).toLowerCase() as 'up' | 'down' | 'left' | 'right')
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
  // The window comes back from the taskbar when the last game started from here has closed, as the C++ one does.
  const wasPlaying = useRef(false)
  useEffect(() => {
    if (wasPlaying.current && playing.size === 0 && lib?.user.minimize) void restoreWindow()
    wasPlaying.current = playing.size > 0
  }, [playing, lib])

  const isReady = useCallback((g: Game) => !!lib && ['ready', 'installed', 'update'].includes(statusOf(g, lib, mods, false).kind), [lib, mods])
  const inCat = useCallback(
    (g: Game, id: string) =>
      id === 'all' || (id === 'favorites' ? favs.has(g.id) : id === 'ready' ? !g.comingSoon && isReady(g) : id === 'soon' ? g.comingSoon : g.categories.includes(id) && !g.comingSoon),
    [favs, isReady],
  )
  // In the C++ sidebar's order: the platforms, then Favorites, Ready to play, Rooms and Coming soon, then the rest.
  const sideList = useMemo(() => {
    if (!lib) return []
    const row = (id: string, name: string, icon: string) => ({ id, name, icon, n: lib.games.filter((g) => inCat(g, id)).length })
    const platform = lib.categories.filter((c) => c.group === 'platform').map((c) => row(c.id, c.name, c.icon))
    const rest = lib.categories.filter((c) => c.group !== 'platform').map((c) => row(c.id, c.name, c.icon))
    return [...platform, row('favorites', 'Favorites', 'E734'), row('ready', 'Ready to play', 'E768'), { id: 'rooms', name: 'Rooms', icon: 'E716', n: -1 },
      row('soon', 'Coming soon', 'E823'), ...rest]
  }, [lib, inCat])

  const shown = useMemo(() => {
    if (!lib) return []
    const q = query.trim().toLowerCase()
    const list = lib.games.filter((g) => inCat(g, cat) &&
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
  }, [lib, cat, query, sort, inCat])

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

  const changed = (s: Partial<Settings>) => {
    setLib((l) => (l ? { ...l, user: { ...l.user, ...s } } : l))
    if ('gamesDir' in s || 'defaultPlayer' in s) refresh()  // file states depend on these
  }

  if (setupOpen) {
    return (
      <SetupPage lib={lib} mods={mods} onChanged={changed} onRefresh={refresh} onRefreshMods={refreshMods}
        onDone={() => {
          setSetupOpen(false)
          go('home')
        }} />
    )
  }

  const playLead = (g: Game) => {
    const a = leadAction(g)
    if (a) actions.run(g, a)
  }
  const tileOf = (g: Game) => (
    <Tile key={g.id} game={g} lib={lib} mods={mods} playing={playingIds.has(g.id)} favorite={favs.has(g.id)}
      selected={g.id === gameId} rooms={allRooms?.[g.id]?.rooms.length ?? 0} onOpen={() => go('game', g.id)} />
  )

  const playable = lib.games.filter((g) => !g.comingSoon)
  const recent = playable.filter((g) => lastPlayed(lib, g.id) > 0).sort((a, b) => lastPlayed(lib, b.id) - lastPlayed(lib, a.id))
  const featured = [...new Set([...recent.slice(0, 2), ...playable.filter((g) => g.image), ...playable])].slice(0, 5)
  const together = playable.filter((g) => g.onlineId || isCoop(g))
  // Steam's home shows what friends play; here, the games with rooms open on the server right now.
  const players = (g: Game) => (allRooms?.[g.id]?.rooms ?? []).reduce((n, r) => n + r.players, 0)
  const liveNow = playable.filter((g) => (allRooms?.[g.id]?.rooms.length ?? 0) > 0).sort((a, b) => players(b) - players(a))
  // And what changed lately, from the website's dates.
  const monthAgo = Date.now() - 45 * 86400000
  const updatedLately = playable.filter((g) => g.site?.updated && Date.parse(g.site.updated) > monthAgo)
    .sort((a, b) => Date.parse(b.site!.updated) - Date.parse(a.site!.updated))
  const pcMods = playable.filter((g) => g.mod)
  const soon = lib.games.filter((g) => g.comingSoon)
  const pageGame = lib.games.find((g) => g.id === gameId)
  const side = view === 'game' || view === 'lobby' ? from : view
  const catName = cat === 'all' ? 'All games' : sideList.find((c) => c.id === cat)?.name ?? 'Library'
  const ruffle = lib.players.find((p) => p.id === 'ruffle') ?? lib.players[0]

  let page: ReactNode
  if (view === 'settings') {
    page = (
      <SettingsPage lib={lib} onChanged={changed} onRunSetup={() => setSetupOpen(true)} />
    )
  } else if (view === 'lobby' && pageGame) {
    page = <LobbyPage game={pageGame} lib={lib} onClose={back} />
  } else if (view === 'game' && pageGame) {
    page = (
      <GamePage key={pageGame.id} game={pageGame} lib={lib} mods={mods} playing={playingIds.has(pageGame.id)}
        modLine={modLines[pageGame.id]} downloading={downloading.has(pageGame.id)} hosting={hosting[pageGame.id]}
        favorite={favs.has(pageGame.id)} onFavorite={() => toggleFav(pageGame.id)} onBack={back} actions={actions}
        askDownload={askDownload === pageGame.id} />
    )
  } else if (view === 'rooms') {
    page = <RoomsPage lib={lib} all={allRooms} onOpen={(g) => go('game', g.id)} onJoin={(g, code) => { const a = joinByCode(g); if (a) actions.run(g, a, code) }} />
  } else if (view === 'library') {
    page = (
      <div className="page">
        <div className="dhead">
          <h1>{catName}</h1>
          <p>{lib.branding.subtitle || 'Every game here plays with friends.'}</p>
          <label className="bigsearch">
            <Search size={20} />
            <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games and mods" spellCheck={false} />
            {query && <button className="clear" aria-label="Clear the search" onClick={() => setQuery('')}><X size={16} /></button>}
          </label>
        </div>
        <div className="dctl">
          <Seg label="Order" value={sort} options={SORTS} onChange={setSort} />
        </div>
        <div className="count-line">{shown.length === 1 ? '1 game' : `${shown.length} games`}</div>
        {shown.length ? (
          <div className="grid">{shown.map(tileOf)}</div>
        ) : (
          <div className="empty">
            <Gamepad2 size={40} />
            <h2>Nothing matches</h2>
            <p>{cat === 'favorites' && !favs.size ? 'No favorites yet. Open a game and press the star.' : 'Try another search, or turn a filter off.'}</p>
          </div>
        )}
      </div>
    )
  } else {
    page = (
      <div className="page">
        <Slider games={featured} lib={lib} onOpen={(g) => go('game', g.id)} onPlay={playLead} />
        {liveNow.length > 0 && (
          <Shelf title="Open right now" note="People are hosting these on the central server. Open one and press Quick play." count={liveNow.length} onSeeAll={() => go('rooms')}>
            {liveNow.map(tileOf)}
          </Shelf>
        )}
        {recent.length > 0 && <Shelf title="Jump back in" count={recent.length}>{recent.map(tileOf)}</Shelf>}
        {updatedLately.length > 0 && <Shelf title="Recently updated" note="New versions in the last few weeks." count={updatedLately.length}>{updatedLately.map(tileOf)}</Shelf>}
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
          <button id="brand" onClick={() => go('home')}>
            <span className="word lbl"><b>{lib.branding.title}</b><small>{lib.branding.subtitle}</small></span>
          </button>
        </div>
        <nav className="navs">
          <button className={`nav ${side === 'home' ? 'on' : ''}`} onClick={() => go('home')} title={mini ? 'Home' : undefined}>
            <Glyph code="E80F" /><span className="lbl">Home</span>
          </button>
          <button className={`nav ${side === 'library' && cat === 'all' ? 'on' : ''}`} onClick={() => { setCat('all'); go('library') }} title={mini ? 'All games' : undefined}>
            <Glyph code="E8A9" /><span className="lbl">All games</span><span className="n">{lib.games.length}</span>
          </button>
          {sideList.map((c) => {
            const on = c.id === 'rooms' ? side === 'rooms' : side === 'library' && cat === c.id
            return (
              <button key={c.id} className={`nav ${on ? 'on' : ''}`} title={mini ? c.name : undefined} aria-current={on ? 'page' : undefined}
                onClick={() => { if (c.id === 'rooms') go('rooms'); else { setCat(c.id); go('library') } }}>
                <Glyph code={c.icon} /><span className="lbl">{c.name}</span>{c.n >= 0 && <span className="n">{c.n}</span>}
              </button>
            )
          })}
        </nav>
        <div className="side-foot">
          <button className={`setbtn ${side === 'settings' ? 'on' : ''}`} onClick={() => go('settings')}>
            <Glyph code="E713" /><span className="lbl">Settings</span>
          </button>
          <button className="minibtn" onClick={() => setMini(!mini)} aria-label={mini ? 'Expand the sidebar' : 'Collapse the sidebar'} title={mini ? 'Expand' : 'Collapse'}>
            <PanelLeft size={17} />
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
        <footer className="statusbar">
          <span className="hints">
            {(pad ? [['A', 'Select'], ['B', 'Back'], ['Y', 'Search'], ['LB/RB', 'Sections']] : [['Enter', 'Open'], ['Ctrl+F', 'Search'], ['Esc', 'Back']])
              .map(([k, l]) => <span key={k}><kbd>{k}</kbd>{l}</span>)}
          </span>
          <span className="grow" />
          {server !== 'unknown' && (
            <span className={`srv ${server}`}><i />{server === 'online' ? `Server online${pingMs !== null ? ` (${pingMs} ms)` : ''}` : server === 'checking' ? 'Checking the server...' : 'Server offline'}</span>
          )}
          {ruffle && <span>{ruffle.name} {ruffle.found ? '\u2713' : <span className="tone-warn">missing</span>}</span>}
          {lib.flashpoint && <span>Flashpoint: {lib.flashpoint}</span>}
        </footer>
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
