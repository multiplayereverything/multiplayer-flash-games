import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Cover } from './Cover'
import type { Action, Game, Library, ModInfo, Room } from './api'
import { loadRooms, open } from './api'
import {
  hostChoices, isCoop, joinByAddress, joinByCode, looksLikeAddress, mainActions, newer, playedText, statusOf,
  type Status,
} from './model'

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

function Glyph({ code }: { code: string }) {
  // launcher.json icons arrive as the glyph itself; a few here are written as hex.
  const ch = /^[0-9A-F]{4}$/i.test(code) ? String.fromCodePoint(parseInt(code, 16)) : code
  return <span className="icon" aria-hidden="true">{ch}</span>
}

// A button with a second line, as the C++ panel draws one: the icon and label on top, the line under them from the
// left edge, and on a red one that can start, a small arrow at the right.
function ActionButton({
  icon, label, sub, primary, warn, disabled, onClick,
}: { icon?: string; label: string; sub?: string; primary?: boolean; warn?: boolean; disabled?: boolean; onClick?: () => void }) {
  if (!sub) {
    return (
      <button className={`btn center ${primary ? 'primary' : ''}`} disabled={disabled} onClick={onClick}>
        {icon && <Glyph code={icon} />}{label}
      </button>
    )
  }
  return (
    <button className={`btn two-line ${primary ? 'primary' : ''}`} disabled={disabled} onClick={onClick}>
      <span className="btn-top">{icon && <Glyph code={icon} />}<span className="btn-main">{label}</span></span>
      <span className={`btn-sub ${warn ? 'warn' : ''}`}>{sub}</span>
      {primary && !disabled && <span className="btn-arrow" aria-hidden="true">{'▶'}</span>}
    </button>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, select, button.primary')?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <h3>{title}</h3>
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
      <label className="field">
        <span>Players</span>
        <select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
          {counts.map((n) => <option key={n} value={n}>{n} players</option>)}
        </select>
      </label>
      {viaRelay && viaIp && (
        <label className="field">
          <span>Friends join with</span>
          <select value={relay ? 'relay' : 'ip'} onChange={(e) => setRelay(e.target.value === 'relay')}>
            <option value="relay">A room code (no port forwarding)</option>
            <option value="ip">Your IP address (direct)</option>
          </select>
        </label>
      )}
      <p className="dialog-note">{pick?.action.description}</p>
      <div className="dialog-row">
        <button className="btn center" onClick={onClose}>Cancel</button>
        <button className="btn center primary" disabled={!pick} onClick={() => pick && onHost(pick.action)}>Host</button>
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
      <label className="field">
        <span>{byAddress ? 'Room code or the host\'s address' : 'Room code'}</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="ABCDE" spellCheck={false} />
      </label>
      <p className="dialog-note">{address ? (byAddress ? 'Connects straight to the host.' : 'This game joins with a room code.') : 'The five letters the host sees.'}</p>
      <div className="dialog-row">
        <button className="btn center" onClick={onClose}>Cancel</button>
        <button className="btn center primary" disabled={!ok} onClick={go}>Join</button>
      </div>
    </Dialog>
  )
}

type Facts = [string, string][]

function factsOf(game: Game, status: Status, mod: ModInfo | undefined): Facts {
  const out: Facts = []
  if (game.mod) out.push(['Made by', game.mod.publisher || 'Multiplayer Everything'])
  if (game.players) out.push(['Players', game.players])
  if (game.mod?.website) out.push(['Source', game.mod.website.replace(/^https?:\/\//, '')])
  const v = game.mod?.pinnedVersion || mod?.newest
  if (v) out.push(['Version', v])
  out.push(['Status', status.text])
  return out
}

function Overview({ game, facts }: { game: Game; facts: Facts }) {
  const g = game.guide
  return (
    <>
      <div className="facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <span className="fact-label">{label}</span>
            <span className="fact-value">{value}</span>
          </div>
        ))}
      </div>
      <section className="card-panel guide">
        <h4>About</h4>
        <p>{game.description}</p>
        {g.needs.length > 0 && (<><h4>What you need</h4><ul>{g.needs.map((s) => <li key={s}>{s}</li>)}</ul></>)}
        {g.steps.length > 0 && (<><h4>How to play</h4><ol>{g.steps.map((s) => <li key={s}>{s}</li>)}</ol></>)}
        {g.tips.length > 0 && (<><h4>Tips</h4><ul>{g.tips.map((s) => <li key={s}>{s}</li>)}</ul></>)}
      </section>
      {g.links.length > 0 && (
        <div className="links">
          {g.links.map((l) => <button key={l.url} className="btn center" onClick={() => open(l.url)}>{l.label}</button>)}
        </div>
      )}
    </>
  )
}

function Details({ game, facts, lib }: { game: Game; facts: Facts; lib: Library }) {
  const cats = lib.categories.filter((c) => game.categories.includes(c.id)).map((c) => c.name).join(', ')
  const rows: Facts = [...facts, ...(cats ? [['Categories', cats] as [string, string]] : []), ['Your play', playedText(lib, game.id)]]
  return (
    <section className="card-panel">
      <dl className="detail-list">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </section>
  )
}

function Releases({ game, mod }: { game: Game; mod: ModInfo | undefined }) {
  const newest = game.mod?.pinnedVersion || mod?.newest
  const installed = mod?.installed ? mod.installedVersion : ''
  if (!newest) return <section className="card-panel"><p className="muted">{mod?.error || 'The versions show once mods-info answers.'}</p></section>
  return (
    <section className="card-panel releases">
      <div className="release">
        <div className="release-head"><strong>{newest}</strong><span className="verified"><i />Verified</span></div>
        <p>{installed === newest ? 'The newest version, installed on this PC.' : 'The newest version. Its download is checked by SHA-256 before anything is installed.'}{mod?.notice ? ` ${mod.notice}` : ''}</p>
      </div>
      {installed && installed !== newest && (
        <div className="release">
          <div className="release-head"><strong>{installed}</strong></div>
          <p>Installed on this PC. Update to play with friends on the newest version.</p>
        </div>
      )}
    </section>
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
    <section className="card-panel rooms">
      {!rooms && !error && <p className="muted">Asking the central server...</p>}
      {error && <p className="muted">{error}</p>}
      {rooms?.length === 0 && !error && <p className="muted">No open rooms. Host one and friends see it here.</p>}
      {rooms?.map((r) => (
        <div className="room" key={r.code}>
          <div>
            <strong>{r.name || r.code}</strong>
            <span className="muted"> {r.code}  {r.players}/{r.max} players</span>
          </div>
          <button className="btn center" disabled={r.players >= r.max} onClick={() => onJoinRoom(r.code)}>{r.players >= r.max ? 'Full' : 'Join'}</button>
        </div>
      ))}
    </section>
  )
}

export interface PageActions {
  run: (game: Game, action: Action, code?: string, address?: string) => void
  modOp: (game: Game, op: 'install' | 'repair' | 'uninstall') => void
}

export function GamePage({
  game, lib, mods, playing, modLine, favorite, onFavorite, onBack, dir, actions,
}: {
  game: Game
  lib: Library
  mods: Record<string, ModInfo> | null
  playing: boolean
  modLine?: string
  favorite: boolean
  onFavorite: () => void
  onBack: () => void
  dir: 'in' | 'out'
  actions: PageActions
}) {
  const [tab, setTab] = useState<'overview' | 'details' | 'releases' | 'rooms'>('overview')
  const [dialog, setDialog] = useState<'host' | 'join' | 'uninstall' | null>(null)
  const back = useRef<HTMLButtonElement>(null)
  const title = useDecode(game.name)
  const mod = mods?.[game.id]
  const st = statusOf(game, lib, mods, playing)
  const facts = factsOf(game, st, mod)
  const verified = game.mod ? game.mod.pinnedVersion || (mod?.published ? mod.newest : '') : ''
  const kicker = lib.categories.filter((c) => game.categories.includes(c.id)).map((c) => c.name).join(', ')
  const tabs = [
    'overview', 'details',
    ...(game.mod ? ['releases'] : []),
    ...(game.onlineId ? ['rooms'] : []),
  ] as ('overview' | 'details' | 'releases' | 'rooms')[]
  const slots = Math.min(6, game.maxPlayers || 2)
  const coop = isCoop(game)
  const main = mainActions(game)
  const busy = modLine !== undefined
  const playerMissing = game.actions.some((a) => a.state === 'noPlayer') && !game.actions.some((a) => a.state === 'ready')

  useEffect(() => back.current?.focus(), [])

  const run = (a: Action, code?: string, address?: string) => actions.run(game, a, code, address)

  let modButtons: ReactNode = null
  if (game.mod && !game.comingSoon) {
    const name = game.mod.gameName || game.name
    if (!mod) modButtons = <ActionButton label="Checking..." sub="Asking mods-info for the newest version" disabled />
    else if (busy) modButtons = <ActionButton primary label="Working..." sub={modLine || 'Starting'} disabled />
    else if (!mod.gameFound) modButtons = <ActionButton label={`Install ${name}`} sub={`${name} wasn't found on this PC`} warn disabled />
    else if (!mod.installed)
      modButtons = (
        <ActionButton primary icon="E896" label={`Install ${name}`} disabled={!mod.published}
          sub={mod.published ? `Version ${mod.newest}, into your ${name} folder` : mod.error || 'Not published yet'}
          onClick={() => actions.modOp(game, 'install')} />
      )
    else {
      const update = mod.published && newer(mod.newest, mod.installedVersion)
      const launchAct = game.actions.find((a) => a.mod === 'launch')
      modButtons = (
        <>
          {update && <ActionButton primary icon="E777" label={`Update to ${mod.newest}`} sub={`You have ${mod.installedVersion}`} onClick={() => actions.modOp(game, 'install')} />}
          {launchAct && <ActionButton primary={!update} icon="E768" label="Launch game" sub={`${game.mod.modName || game.name} ${mod.installedVersion} is installed`} onClick={() => run(launchAct)} />}
          <ActionButton icon="E90F" label="Repair" sub="Put back missing or damaged files" onClick={() => actions.modOp(game, 'repair')} />
          <ActionButton icon="E74D" label="Uninstall" sub="Restore the files the mod replaced" onClick={() => setDialog('uninstall')} />
        </>
      )
    }
  }

  return (
    <div className={`page enter-${dir === 'in' ? 'right' : 'left'}`}>
      <div className="page-main">
        <header className="page-head">
          <div className="backdrop"><Cover game={game} className="fill" /></div>
          <div className="backdrop-shade" />
          <div className="page-head-top">
            <button ref={back} className="btn quiet back" onClick={onBack}>Back to games</button>
            {verified && <span className="verified big"><i />Verified {verified}</span>}
          </div>
          <div className="page-id">
            <div className="page-icon"><Cover game={game} className="fill" /></div>
            <div className="page-text">
              <span className="kicker">{kicker}</span>
              <h2 aria-label={game.name}>{title}</h2>
              <p className="tagline">{game.description}</p>
            </div>
          </div>
        </header>
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="tab-body" key={tab}>
          {tab === 'overview' && <Overview game={game} facts={facts} />}
          {tab === 'details' && <Details game={game} facts={facts} lib={lib} />}
          {tab === 'releases' && <Releases game={game} mod={mod} />}
          {tab === 'rooms' && <RoomsTab game={game} onJoinRoom={(code) => { const a = joinByCode(game); if (a) run(a, code) }} />}
        </div>
      </div>
      <aside className="panel" aria-label="Play">
        <h3>{game.name}</h3>
        <div className="slots" aria-label={`${slots} player slots`}>
          {Array.from({ length: slots }, (_, i) => (
            <div className="slot" key={i} style={{ ['--p' as string]: lib.branding.playerColors[i % lib.branding.playerColors.length] }}>P{i + 1}</div>
          ))}
        </div>
        <div className={`pill ${st.kind}`}><i />{st.text}</div>
        {playerMissing && <p className="panel-note">Ruffle Together isn't installed yet. The C++ launcher installs it on its first start.</p>}
        <div className="actions">
          {game.comingSoon && <div className="soon-note">Not playable yet: this mod is still being built.</div>}
          {!game.comingSoon && coop && (
            <>
              <ActionButton primary icon={''} label="Host a game" onClick={() => setDialog('host')} />
              <ActionButton icon={''} label="Join a game" onClick={() => setDialog('join')} />
            </>
          )}
          {!game.comingSoon && !game.mod && main.map((a, i) => (
            <ActionButton key={a.id} primary={!coop && i === 0 && a.state === 'ready'} icon={a.icon} label={a.label}
              sub={a.state !== 'ready' ? (a.state === 'noFile' ? 'Game file missing' : a.state === 'noPlayer' ? 'No Flash player found' : 'Server program missing') : a.description || (a.player ?? '')}
              warn={a.state !== 'ready'} onClick={() => run(a)} />
          ))}
          {modButtons}
          {game.actions.filter((a) => a.link).map((a) => (
            <button className="btn link" key={a.id} onClick={() => open(a.link)}>
              <span className="btn-main">{a.label}</span>
              {a.description && <span className="btn-sub">{a.description}</span>}
            </button>
          ))}
          <div className="row">
            <button className="btn quiet" onClick={onFavorite} aria-pressed={favorite}>
              <Glyph code={favorite ? 'E735' : 'E734'} />Favorite
            </button>
            <button className="btn quiet" disabled={!(mod?.gameDir || lib.gamesDir)} onClick={() => open(mod?.gameDir || lib.gamesDir)}>Folder</button>
          </div>
        </div>
      </aside>
      {dialog === 'host' && <HostDialog game={game} onClose={() => setDialog(null)} onHost={(a) => (setDialog(null), run(a))} />}
      {dialog === 'join' && <JoinDialog game={game} onClose={() => setDialog(null)} onJoin={(a, code, address) => (setDialog(null), run(a, code, address))} />}
      {dialog === 'uninstall' && (
        <Dialog title={`Uninstall ${game.mod?.modName || game.name}?`} onClose={() => setDialog(null)}>
          <p className="dialog-note">The mod's files are removed and the game's own files it replaced are put back.</p>
          <div className="dialog-row">
            <button className="btn center" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn center primary" onClick={() => (setDialog(null), actions.modOp(game, 'uninstall'))}>Uninstall</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
