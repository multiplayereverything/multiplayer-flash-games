import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft, Check, Download, ExternalLink, FolderOpen, Globe, LogIn, MoreHorizontal, Play, RefreshCw, Server, ShieldCheck, Star,
  Trash2, TriangleAlert, Users, Wrench,
} from 'lucide-react'
import { Cover } from './Cover'
import type { Action, Game, Library, ModInfo, RelayStatus, Room } from './api'
import { copyText, loadRooms, open } from './api'
import {
  agoText, fileAction, hostChoices, isCoop, joinByAddress, joinByCode, lastPlayed, looksLikeAddress, mainActions, moreActions, newer,
  playersShort, statusOf,
} from './model'
import { MenuButton, Pips, type MenuItem } from './ui'

const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&'
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The title decodes on a new page: one of the few moves tied to a real event.
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
      setShown(text.split('').map((ch, i) => (i < settled || ch === ' ' ? ch : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)])).join(''))
      if (frame >= total) {
        window.clearInterval(id)
        setShown(text)
      }
    }, 28)
    return () => window.clearInterval(id)
  }, [text])
  return shown
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, select, .btn.main')?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function HostDialog({ game, onHost, onClose }: { game: Game; onHost: (a: Action) => void; onClose: () => void }) {
  const choices = hostChoices(game)
  const counts = [...new Set(choices.map((c) => c.players))].sort((a, b) => a - b)
  const [players, setPlayers] = useState(counts[0] ?? 2)
  const viaRelay = choices.some((c) => c.relay)
  const viaIp = choices.some((c) => !c.relay)
  const [relay, setRelay] = useState(viaRelay)
  const pick = choices.find((c) => c.players === players && c.relay === relay) ?? choices.find((c) => c.players === players)
  return (
    <Dialog title={`Host ${game.name}`} onClose={onClose}>
      <div className="opt-h">Players</div>
      <div className="seg">
        {counts.map((n) => <button key={n} role="radio" aria-checked={n === players} onClick={() => setPlayers(n)}>{n} players</button>)}
      </div>
      {viaRelay && viaIp && (
        <>
          <div className="opt-h">Friends join with</div>
          <div className="choice">
            <button aria-pressed={relay} onClick={() => setRelay(true)}><Globe size={18} /><span><b>A room code</b><small>Through the central server. No port forwarding.</small></span></button>
            <button aria-pressed={!relay} onClick={() => setRelay(false)}><Server size={18} /><span><b>Your IP address</b><small>Straight to this PC: LAN, Radmin VPN or ZeroTier.</small></span></button>
          </div>
        </>
      )}
      <p className="dialog-note">{pick?.action.description}</p>
      <div className="dialog-row">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn main" disabled={!pick} onClick={() => pick && onHost(pick.action)}>Host</button>
      </div>
    </Dialog>
  )
}

function JoinDialog({ game, onJoin, onClose }: { game: Game; onJoin: (a: Action, code?: string, address?: string) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const byCode = joinByCode(game)
  const byAddress = joinByAddress(game)
  const address = looksLikeAddress(text)
  const code = text.replace(/[^a-z0-9]/gi, '').toUpperCase()
  const action = address ? byAddress : byCode
  const ok = !!action && (address ? text.trim().length > 3 : code.length === 5)
  const go = () => ok && action && (address ? onJoin(action, undefined, text.trim()) : onJoin(action, code))
  return (
    <Dialog title={`Join ${game.name}`} onClose={onClose}>
      <label className="opt-h" htmlFor="join-code">{byAddress ? 'Room code or the host\'s address' : 'Room code'}</label>
      <input id="join-code" className="field code" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="ABCDE" spellCheck={false} />
      <p className="dialog-note">{address ? (byAddress ? 'Connects straight to the host.' : 'This game joins with a room code.') : 'The five letters the host sees.'}</p>
      <div className="dialog-row">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn main" disabled={!ok} onClick={go}>Join</button>
      </div>
    </Dialog>
  )
}

function RoomsTab({ game, onJoinRoom }: { game: Game; onJoinRoom: (code: string) => void }) {
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const get = () =>
      loadRooms(game.id)
        .then((r) => alive && (setRooms(r.rooms), setError(r.onServer ? r.error : 'Not on the central server yet.')))
        .catch((e) => alive && setError(String(e)))
    get()
    const id = window.setInterval(get, 15000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [game.id])
  return (
    <div className="card">
      <div className="card-h"><h3>Open rooms</h3><span>Refreshes every 15 seconds</span></div>
      {!rooms && !error && <p className="muted">Asking the central server...</p>}
      {error && <p className="muted">{error}</p>}
      {rooms?.length === 0 && !error && <p className="muted">No open rooms. Host one and friends see it here.</p>}
      <div className="dl">
        {rooms?.map((r) => (
          <div key={r.code} className="room-line">
            <span><b>{r.name || r.code}</b><small>{r.code}, {r.players} of {r.max} players</small></span>
            <button className="btn sm" disabled={r.players >= r.max} onClick={() => onJoinRoom(r.code)}>{r.players >= r.max ? 'Full' : 'Join'}</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface PageActions {
  run: (game: Game, action: Action, code?: string, address?: string) => void
  modOp: (game: Game, op: 'install' | 'repair' | 'uninstall') => void
  openLobby: (game: Game) => void
  stopHosting: (session: number) => void
  download: (game: Game) => void
  locate: (game: Game, action: Action) => void
  chooseFolder: (game: Game) => void
}

// While this PC hosts with the built-in relay: where friends connect, who has, and Stop hosting.
function HostingCard({ status, session, onStop, colors }: { status: RelayStatus; session: number; onStop: (s: number) => void; colors: string[] }) {
  const [copied, setCopied] = useState('')
  const guests = status.peers.filter((p) => !p.host)
  return (
    <div className="card pinned">
      <div className="card-h"><h3>Hosting</h3><span>Port {status.port}</span></div>
      <div className="dl">
        {status.addresses.slice(0, 3).map((a) => {
          const addr = `${a.address}:${status.port}`
          return (
            <div key={addr}>
              <dt>{a.adapter}</dt>
              <dd><button className="linkbtn" onClick={() => copyText(addr).then(() => setCopied(addr))}>{copied === addr ? 'Copied' : addr}</button></dd>
            </div>
          )
        })}
      </div>
      <div className="slots">
        {['You', ...guests.map((p) => p.name || p.address)].map((n, i) => (
          <span key={i} className="slot filled" style={{ ['--p' as string]: colors[i % colors.length] }}><i>P{i + 1}</i>{n}</span>
        ))}
        {!guests.length && <span className="slot open"><i>P2</i>Waiting for friends</span>}
      </div>
      <button className="btn danger" onClick={() => onStop(session)}>Stop hosting</button>
    </div>
  )
}

interface Need { label: string; sub: string; ok: boolean; fix?: { label: string; onClick: () => void } }

// The pill behind the chosen tab slides to it.
function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; name: string }[]; value: T; onChange: (t: T) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState({ x: 0, w: 0 })
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth })
  }, [value, tabs.length])
  return (
    <div className="tabs">
      <div className="tabs-in" role="tablist" ref={box}>
        <span className="tab-pill" style={{ transform: `translateX(${pill.x - 4}px)`, width: pill.w }} />
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === value} className={t.id === value ? 'on' : ''} onClick={() => onChange(t.id)}>{t.name}</button>
        ))}
      </div>
    </div>
  )
}

type Tab = 'overview' | 'guide' | 'versions' | 'rooms'

export function GamePage({
  game, lib, mods, playing, modLine, downloading, hosting, favorite, onFavorite, onBack, actions,
}: {
  game: Game
  lib: Library
  mods: Record<string, ModInfo> | null
  playing: boolean
  modLine?: string
  downloading: boolean
  hosting?: { session: number; relay: RelayStatus }
  favorite: boolean
  onFavorite: () => void
  onBack: () => void
  actions: PageActions
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [dialog, setDialog] = useState<'host' | 'join' | 'uninstall' | null>(null)
  const backBtn = useRef<HTMLButtonElement>(null)
  const title = useDecode(game.name)
  const mod = mods?.[game.id]
  const st = statusOf(game, lib, mods, playing)
  const cats = lib.categories.filter((c) => game.categories.includes(c.id)).map((c) => c.name)
  const kicker = cats.slice(0, 2)
  const colors = lib.branding.playerColors
  const coop = isCoop(game) && !game.lobby
  const main = mainActions(game, lib.user)
  const more = moreActions(game, lib.user)
  const busy = modLine !== undefined
  const fileAct = fileAction(game)
  const fileMissing = !game.mod && !game.comingSoon && fileAct?.state === 'noFile'
  const playerMissing = !game.mod && game.actions.some((a) => a.state === 'noPlayer') && !game.actions.some((a) => a.state === 'ready')
  const modName = game.mod?.gameName || game.name
  const update = !!mod?.installed && mod.published && newer(mod.newest, mod.installedVersion)
  const launchAct = game.actions.find((a) => a.mod === 'launch')
  const verified = game.mod ? game.mod.pinnedVersion || (mod?.published ? mod.newest : '') : ''
  const u = lib.user.games[game.id]
  const run = (a: Action, code?: string, address?: string) => actions.run(game, a, code, address)

  useEffect(() => backBtn.current?.focus(), [])

  // The one or two big buttons beside the title; everything else waits in the "..." menu.
  type Big = { label: string; icon: ReactNode; onClick?: () => void; disabled?: boolean }
  let lead: Big | null = null
  let second: Big | null = null
  const rest: (MenuItem | null)[] = []
  const playIcon = <Play size={18} fill="currentColor" />
  if (game.comingSoon) lead = { label: 'Coming soon', icon: <TriangleAlert size={18} />, disabled: true }
  else if (game.mod) {
    if (!mod) lead = { label: 'Checking...', icon: <RefreshCw size={18} />, disabled: true }
    else if (busy) lead = { label: 'Working...', icon: <RefreshCw size={18} className="spin" />, disabled: true }
    else if (!mod.gameFound) lead = { label: 'Choose the game folder', icon: <FolderOpen size={18} />, onClick: () => actions.chooseFolder(game) }
    else if (!mod.installed) lead = { label: `Install`, icon: <Download size={18} />, disabled: !mod.published, onClick: () => actions.modOp(game, 'install') }
    else {
      if (update) lead = { label: `Update to ${mod.newest}`, icon: <Download size={18} />, onClick: () => actions.modOp(game, 'install') }
      const launchBig = launchAct ? { label: 'Play', icon: playIcon, onClick: () => run(launchAct) } : null
      if (lead) second = launchBig
      else lead = launchBig
      rest.push({ label: 'Repair', icon: <Wrench size={16} />, onClick: () => actions.modOp(game, 'repair') })
      rest.push({ label: 'Uninstall', icon: <Trash2 size={16} />, danger: true, onClick: () => setDialog('uninstall') })
    }
    if (mod?.gameFound) rest.push({ label: `Use another ${modName} folder`, icon: <FolderOpen size={16} />, onClick: () => actions.chooseFolder(game) })
  } else {
    if (fileMissing && fileAct) {
      lead = { label: downloading ? 'Downloading...' : 'Download', icon: <Download size={18} />, disabled: downloading, onClick: () => actions.download(game) }
      rest.push({ label: 'Locate the game file', icon: <FolderOpen size={16} />, onClick: () => actions.locate(game, fileAct) })
    }
    if (game.lobby) {
      const b = { label: 'Play online', icon: playIcon, onClick: () => actions.openLobby(game) }
      if (lead) second = b
      else lead = b
    } else if (coop) {
      const host = { label: 'Host a game', icon: playIcon, onClick: () => setDialog('host') }
      const join = { label: 'Join', icon: <LogIn size={18} />, onClick: () => setDialog('join') }
      if (!lead) [lead, second] = [host, join]
      else {
        second = host
        rest.push({ label: 'Join a game', icon: <LogIn size={16} />, onClick: () => setDialog('join') })
      }
    }
    for (const a of main.filter((x) => !(game.lobby && x.id === game.joinAction))) {
      const item = { label: a.label, icon: playIcon, onClick: () => run(a), disabled: a.state !== 'ready' }
      if (!lead) lead = item
      else if (!second && !coop) second = { ...item, icon: <Play size={18} /> }
      else rest.push({ ...item, icon: <Play size={16} /> })
    }
    for (const a of more) rest.push({ label: a.label, icon: <Server size={16} />, onClick: () => (a.asksAddress ? setDialog('join') : run(a)) })
  }
  for (const a of game.actions.filter((x) => x.link)) rest.push({ label: a.label, icon: <ExternalLink size={16} />, onClick: () => open(a.link) })
  const folder = mod?.gameDir || lib.gamesDir
  if (folder) rest.push({ label: 'Open the folder', icon: <FolderOpen size={16} />, onClick: () => open(folder) })

  // What the game needs, each with a tick: the card at the right.
  const needs: Need[] = []
  if (game.mod) {
    needs.push({ label: `Your copy of ${modName}`, sub: mod?.gameFound ? mod.gameDir || 'Found on this PC' : 'Not found on this PC', ok: !!mod?.gameFound, fix: mod && !mod.gameFound ? { label: 'Choose', onClick: () => actions.chooseFolder(game) } : undefined })
    needs.push({ label: game.mod.modName || 'The mod', sub: mod?.installed ? `Version ${mod.installedVersion} installed` : 'Not installed yet', ok: !!mod?.installed })
    if (mod?.installed) needs.push({ label: 'Up to date', sub: update ? `${mod.newest} is out` : `${mod.installedVersion} is the newest`, ok: !update })
  } else if (!game.comingSoon) {
    const pl = game.actions.find((a) => a.player)?.player
    needs.push({ label: pl || 'Flash player', sub: playerMissing ? 'Not installed yet. The launcher installs it on its first start.' : 'Plays the game', ok: !playerMissing })
    if (fileAct) needs.push({ label: 'The game file', sub: fileMissing ? 'Download it, or locate a copy you have' : fileAct.file?.replace(/^.*[\\/]/, '') || 'Found', ok: !fileMissing, fix: fileMissing ? { label: 'Locate', onClick: () => actions.locate(game, fileAct) } : undefined })
    if (game.onlineId) needs.push({ label: 'Room codes', sub: 'Friends join through the central server', ok: true })
  }
  const allOk = needs.every((n) => n.ok)

  const tabs: { id: Tab; name: string }[] = [
    { id: 'overview', name: 'Overview' },
    ...(game.guide.steps.length || game.guide.needs.length || game.guide.tips.length ? [{ id: 'guide' as Tab, name: 'How to play' }] : []),
    ...(game.mod ? [{ id: 'versions' as Tab, name: 'Versions' }] : []),
    ...(game.onlineId ? [{ id: 'rooms' as Tab, name: 'Rooms' }] : []),
  ]
  const g = game.guide
  const stats: [string, string][] = [
    ['Played', u?.seconds ? (u.seconds >= 3600 ? `${Math.floor(u.seconds / 3600)} h ${Math.round((u.seconds % 3600) / 60)} min` : `${Math.max(1, Math.round(u.seconds / 60))} min`) : 'Not yet'],
    ['Last played', lastPlayed(lib, game.id) ? agoText(lastPlayed(lib, game.id)) : 'Never'],
    ['Players', playersShort(game)],
    game.mod ? ['Version', mod?.installedVersion || game.mod.pinnedVersion || mod?.newest || 'Unknown'] : ['Times played', String(u?.plays ?? 0)],
  ]

  return (
    <div className="gp">
      <div className="gp-amb"><Cover game={game} className="fill" /></div>
      <div className="gp-hero">
        <Cover game={game} className="fill" />
        <button ref={backBtn} className="btn glass gp-back" onClick={onBack}><ArrowLeft size={17} />Back</button>
      </div>
      <div className="gp-top">
        <div className="gp-cover"><Cover game={game} className="fill" tall /></div>
        <div className="gp-title">
          {kicker.length > 0 && <span className="kick">{kicker.join(', ')}</span>}
          <h1 aria-label={game.name}>{title}</h1>
          <span className="based">
            <Pips n={game.maxPlayers} colors={colors} />
            <span>{game.mod ? <>Mod for <b>{modName}</b></> : <b>{game.players}</b>}</span>
          </span>
          {game.mod && (
            <div className="gp-chips">
              <span className="tag"><span className="avatar sm">{(game.mod.publisher || 'M').slice(0, 1)}</span>By <b>{game.mod.publisher || 'Multiplayer Everything'}</b></span>
              {verified && <span className="tag cy"><ShieldCheck size={14} />Verified {verified}</span>}
            </div>
          )}
        </div>
        <div className="gp-acts">
          {lead && (
            <button className="btn main big" disabled={lead.disabled} onClick={lead.onClick}>{lead.icon}{lead.label}</button>
          )}
          {second && <button className="btn big" disabled={second.disabled} onClick={second.onClick}>{second.icon}{second.label}</button>}
          <button className={`btn sq ${favorite ? 'on' : ''}`} aria-pressed={favorite} aria-label="Favorite" title="Favorite" onClick={onFavorite}>
            <Star size={19} fill={favorite ? 'currentColor' : 'none'} />
          </button>
          {rest.length > 0 && <MenuButton className="btn sq" label="More" icon={<MoreHorizontal size={20} />} items={rest} />}
        </div>
      </div>
      {busy && <div className="gp-prog"><span className="bar"><i /></span>{modLine}</div>}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div className="g-body">
        <div className="stack" key={tab}>
          {tab === 'overview' && (
            <>
              <div className="stats">{stats.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
              <p className="blurb">{game.description}</p>
              {cats.length > 0 && <div className="feat">{cats.map((k) => <span key={k}>{k}</span>)}</div>}
              {g.steps.length > 0 && (
                <div className="card">
                  <div className="card-h"><h3>How to play</h3><span>{g.steps.length} steps</span></div>
                  <ol className="steps">{g.steps.slice(0, 3).map((s) => <li key={s}>{s}</li>)}</ol>
                  {g.steps.length > 3 && <button className="linkbtn" onClick={() => setTab('guide')}>All the steps</button>}
                </div>
              )}
            </>
          )}
          {tab === 'guide' && (
            <>
              {g.needs.length > 0 && <div className="card"><h3>What you need</h3><ul className="steps">{g.needs.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              {g.steps.length > 0 && <div className="card"><h3>How to play</h3><ol className="steps">{g.steps.map((s) => <li key={s}>{s}</li>)}</ol></div>}
              {g.tips.length > 0 && <div className="card"><h3>Tips</h3><ul className="steps">{g.tips.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              {g.links.length > 0 && <div className="acts">{g.links.map((l) => <button key={l.url} className="btn" onClick={() => open(l.url)}><ExternalLink size={16} />{l.label}</button>)}</div>}
            </>
          )}
          {tab === 'versions' && (
            <div className="card">
              <div className="card-h"><h3>Versions</h3><span>Checked by SHA-256 before anything is installed</span></div>
              {!(game.mod?.pinnedVersion || mod?.newest) ? (
                <p className="muted">{mod?.error || 'The versions show once mods-info answers.'}</p>
              ) : (
                <div className="dl">
                  <div><dt>Newest</dt><dd>{game.mod?.pinnedVersion || mod?.newest} {verified && <span className="tag cy sm"><ShieldCheck size={13} />Verified</span>}</dd></div>
                  <div><dt>On this PC</dt><dd>{mod?.installed ? mod.installedVersion : 'Not installed'}</dd></div>
                  {mod?.notice && <div><dt>Note</dt><dd>{mod.notice}</dd></div>}
                  {game.mod?.website && <div><dt>Source</dt><dd><button className="linkbtn" onClick={() => open(game.mod!.website)}>{game.mod.website.replace(/^https?:\/\//, '')}</button></dd></div>}
                </div>
              )}
            </div>
          )}
          {tab === 'rooms' && <RoomsTab game={game} onJoinRoom={(code) => { const a = joinByCode(game); if (a) run(a, code) }} />}
        </div>

        <aside className="stack">
          {hosting && <HostingCard status={hosting.relay} session={hosting.session} onStop={actions.stopHosting} colors={colors} />}
          {needs.length > 0 && (
            <div className="card">
              <div className="card-h"><h3>{st.kind === 'playing' ? 'Playing now' : allOk ? 'Ready to play' : 'Almost ready'}</h3><span>{allOk ? 'Everything it needs is here' : 'One thing to sort out'}</span></div>
              <div className="needs">
                {needs.map((n) => (
                  <div key={n.label} className="need">
                    <span className="k"><b>{n.label}</b><small title={n.sub}>{n.sub}</small></span>
                    {n.fix ? <button className="btn sm" onClick={n.fix.onClick}>{n.fix.label}</button>
                      : <span className={`tick ${n.ok ? 'ok' : 'no'}`}>{n.ok ? <Check size={16} strokeWidth={3} /> : <TriangleAlert size={15} />}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-h"><h3>Player slots</h3><span><Users size={14} /> up to {game.maxPlayers || 2}</span></div>
            <div className="slots">
              {Array.from({ length: Math.min(6, game.maxPlayers || 2) }, (_, i) => (
                <span key={i} className="slot" style={{ ['--p' as string]: colors[i % colors.length] }}><i>P{i + 1}</i></span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {dialog === 'host' && <HostDialog game={game} onClose={() => setDialog(null)} onHost={(a) => (setDialog(null), run(a))} />}
      {dialog === 'join' && <JoinDialog game={game} onClose={() => setDialog(null)} onJoin={(a, code, address) => (setDialog(null), run(a, code, address))} />}
      {dialog === 'uninstall' && (
        <Dialog title={`Uninstall ${game.mod?.modName || game.name}?`} onClose={() => setDialog(null)}>
          <p className="dialog-note">The mod's files are removed and the game's own files it replaced are put back.</p>
          <div className="dialog-row">
            <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn main danger-fill" onClick={() => (setDialog(null), actions.modOp(game, 'uninstall'))}>Uninstall</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
