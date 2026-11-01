import { useEffect, useRef, useState } from 'react'
import { Cover } from './Cover'
import { INSTALLED, NEWEST, PLAYED_HOURS_AGO, PLAYER_COLORS, agoText, leadAction, statusOf } from './mock'
import type { Category, Game } from './types'

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

type Facts = [string, string][]

function factsOf(game: Game): Facts {
  const out: Facts = []
  if (game.mod) out.push(['Made by', game.mod.publisher ?? 'Multiplayer Everything'])
  if (game.players) out.push(['Players', game.players])
  if (game.mod?.website) out.push(['Source', game.mod.website.replace(/^https?:\/\//, '')])
  const v = game.mod ? NEWEST[game.id] : undefined
  if (v) out.push(['Version', v])
  const st = statusOf(game)
  if (st.text) out.push(['Status', st.text])
  return out
}

function Glyph({ code }: { code: string }) {
  return <span className="icon" aria-hidden="true">{String.fromCodePoint(parseInt(code, 16))}</span>
}

// A button with a second line, as the C++ panel draws one: the icon and label on top, the line under them from the
// left edge, and on a red one that can start, a small arrow at the right.
function ActionButton({ icon, label, sub, primary }: { icon: string; label: string; sub: string; primary?: boolean }) {
  return (
    <button className={`btn two-line ${primary ? 'primary' : ''}`}>
      <span className="btn-top"><Glyph code={icon} /><span className="btn-main">{label}</span></span>
      <span className="btn-sub">{sub}</span>
      {primary && <span className="btn-arrow" aria-hidden="true">{'▶'}</span>}
    </button>
  )
}

function Slots({ n }: { n: number }) {
  return (
    <div className="slots" aria-label={`${n} player slots`}>
      {Array.from({ length: n }, (_, i) => (
        <div className="slot" key={i} style={{ ['--p' as string]: PLAYER_COLORS[i] }}>P{i + 1}</div>
      ))}
    </div>
  )
}

function Overview({ game, facts }: { game: Game; facts: Facts }) {
  const steps = game.mod
    ? ['Install the mod: the launcher finds your copy of the game and puts the mod in its folder.', 'Launch the game from here, then host or join from its own menu.', 'Friends join through Steam, your network or an address.']
    : ['Host a game: the launcher opens Ruffle Together and gives you a room code.', 'Send the code to your friends; they press Join a game and type it in.', 'Everyone needs the same version.']
  return (
    <>
      {facts.length > 0 && (
        <div className="facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <span className="fact-label">{label}</span>
              <span className="fact-value">{value}</span>
            </div>
          ))}
        </div>
      )}
      <section className="card-panel guide">
        <h4>About</h4>
        <p>{game.description}</p>
        <h4>What you need</h4>
        <ul>
          <li>{game.mod ? `Your own copy of ${game.mod.gameName ?? game.name}.` : 'Ruffle Together. The launcher installs it for you the first time.'}</li>
          <li>A player name: the launcher asks for it on the first start, and Settings changes it.</li>
        </ul>
        <h4>How to play</h4>
        <ol>
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </section>
    </>
  )
}

function Details({ game, facts, categories }: { game: Game; facts: Facts; categories: Category[] }) {
  const cats = categories.filter((c) => game.categories?.includes(c.id)).map((c) => c.name).join(', ')
  const hours = PLAYED_HOURS_AGO[game.id]
  const rows: Facts = [...facts, ...(cats ? [['Categories', cats] as [string, string]] : []), ['Your play', hours ? `Last played ${agoText(hours)}.` : 'Not played yet.']]
  return (
    <section className="card-panel">
      <dl className="detail-list">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </section>
  )
}

function Releases({ game }: { game: Game }) {
  const newest = NEWEST[game.id]
  const installed = INSTALLED[game.id]
  if (!newest) return <section className="card-panel"><p className="muted">The versions show once mods-info answers.</p></section>
  return (
    <section className="card-panel releases">
      <div className="release">
        <div className="release-head"><strong>{newest}</strong><span className="verified"><i />Verified</span></div>
        <p>{installed === newest ? 'The newest version, installed on this PC.' : 'The newest version. Its download is checked by SHA-256 before anything is installed.'}</p>
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

export function GamePage({
  game, categories, favorite, onFavorite, onBack, dir,
}: {
  game: Game
  categories: Category[]
  favorite: boolean
  onFavorite: () => void
  onBack: () => void
  dir: 'in' | 'out'
}) {
  const [tab, setTab] = useState<'overview' | 'details' | 'releases'>('overview')
  const back = useRef<HTMLButtonElement>(null)
  const title = useDecode(game.name)
  const st = statusOf(game)
  const facts = factsOf(game)
  const lead = leadAction(game)
  const verified = game.mod ? NEWEST[game.id] : undefined
  const kicker = categories.filter((c) => game.categories?.includes(c.id)).map((c) => c.name).join(', ')
  const tabs = game.mod ? (['overview', 'details', 'releases'] as const) : (['overview', 'details'] as const)

  useEffect(() => back.current?.focus(), [])

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
          {tab === 'details' && <Details game={game} facts={facts} categories={categories} />}
          {tab === 'releases' && <Releases game={game} />}
        </div>
      </div>
      <aside className="panel" aria-label="Play">
        <h3>{game.name}</h3>
        <Slots n={Math.min(6, game.maxPlayers ?? 2)} />
        {st.text && <div className={`pill ${st.kind}`}><i />{st.text}</div>}
        <div className="actions">
          {st.kind === 'soon' && <div className="soon-note">Not playable yet: this mod is still being built.</div>}
          {lead && game.online && !game.mod && (
            <>
              <button className="btn primary center"><Glyph code="E774" />Host a game</button>
              <button className="btn center"><Glyph code="E774" />Join a game</button>
              <ActionButton icon="E77B" label="Play offline" sub="The game on your own" />
            </>
          )}
          {lead && (game.mod || !game.online) && (
            <ActionButton primary icon={game.mod ? (st.kind === 'installed' ? 'E768' : 'E896') : 'E768'} label={lead.label} sub={lead.sub} />
          )}
          {game.actions.filter((a) => a.link).map((a) => (
            <a className="btn link" key={a.id} href={a.link} target="_blank" rel="noreferrer">
              <span className="btn-main">{a.label}</span>
              {a.description && <span className="btn-sub">{a.description}</span>}
            </a>
          ))}
          <div className="row">
            <button className="btn quiet" onClick={onFavorite} aria-pressed={favorite}>
              <Glyph code={favorite ? 'E735' : 'E734'} />Favorite
            </button>
            <button className="btn quiet">Folder</button>
          </div>
        </div>
      </aside>
    </div>
  )
}
