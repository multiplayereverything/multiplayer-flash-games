// The pieces every page uses: box-art tiles, shelves that page sideways, pickers, switches and a menu.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Globe, Play, Star } from 'lucide-react'
import { Cover } from './Cover'
import type { Game, Library, ModInfo } from './api'
import { leadAction, playersShort, statusOf } from './model'

export function Pips({ n, colors }: { n: number; colors: string[] }) {
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: Math.min(6, Math.max(1, n)) }, (_, i) => <i key={i} style={{ background: colors[i % colors.length] }} />)}
    </span>
  )
}

interface TileProps {
  game: Game
  lib: Library
  mods: Record<string, ModInfo> | null
  playing: boolean
  favorite: boolean
  onOpen: () => void
  onPlay: () => void
}

// Box art with the name under it. Hovering lifts it over a glow of its own colors and shows a round Play.
export function Tile({ game, lib, mods, playing, favorite, onOpen, onPlay }: TileProps) {
  const st = statusOf(game, lib, mods, playing)
  const lead = leadAction(game)
  const corner = playing ? 'Playing' : st.kind === 'update' ? 'Update' : st.kind === 'soon' ? 'Soon' : ''
  const glow = game.image ? { backgroundImage: `url("${game.image}")` } : { background: `linear-gradient(160deg, ${game.color}, ${game.colorEnd})` }
  return (
    <div className="tile">
      <span className="glow" style={glow} />
      <button className="tile-b" onClick={onOpen} aria-label={`${game.name}, ${game.players}`}>
        <span className="poster">
          <Cover game={game} className="fill" tall />
          {game.mod ? <span className="badge tl">PC mod</span> : game.onlineId ? <span className="badge tl"><Globe size={12} />Online</span> : null}
          {corner && <span className={`badge tr ${st.kind === 'soon' ? 'soon' : ''}`}>{corner}</span>}
          {favorite && <span className="badge fav" aria-label="Favorite"><Star size={12} fill="currentColor" /></span>}
        </span>
        <span className="t">{game.name}</span>
        <span className="s"><Pips n={game.maxPlayers} colors={lib.branding.playerColors} /><span>{playersShort(game)}</span></span>
      </button>
      {lead?.state === 'ready' && !game.comingSoon && (
        <span className="qpw"><button className="qp" aria-label={`${lead.label}: ${game.name}`} onClick={onPlay}><Play size={18} fill="currentColor" /></button></span>
      )}
    </div>
  )
}

// A titled row of tiles that pages sideways, with "1 of 3" and arrows.
export function Shelf({ title, note, children, count, onSeeAll }: { title: string; note?: string; children: ReactNode; count: number; onSeeAll?: () => void }) {
  const view = useRef<HTMLDivElement>(null)
  const [per, setPer] = useState(6)
  const [page, setPage] = useState(0)
  useLayoutEffect(() => {
    const el = view.current
    if (!el) return
    const fit = () => setPer(Math.max(2, Math.floor((el.clientWidth - 40 + 20) / (168 + 20))))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pages = Math.max(1, Math.ceil(count / per))
  const at = Math.min(page, pages - 1)
  return (
    <section className="shelf" style={{ ['--per' as string]: per }}>
      <div className="shelf-h">
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        <div className="pager">
          {pages > 1 && <small>{at + 1} of {pages}</small>}
          {onSeeAll && <button className="see" onClick={onSeeAll}>See all</button>}
          {pages > 1 && (
            <>
              <button className="ar" aria-label="Previous" disabled={at === 0} onClick={() => setPage(at - 1)}><ChevronLeft size={18} /></button>
              <button className="ar" aria-label="Next" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}><ChevronRight size={18} /></button>
            </>
          )}
        </div>
      </div>
      <div className="viewport" ref={view}>
        <div className="track" style={{ transform: `translateX(calc(${-at} * (100% + var(--gap))))` }}>{children}</div>
      </div>
    </section>
  )
}

// Closes on a click outside or Escape.
function useDismiss(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close())
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, close])
  return root
}

// A rounded picker: a quiet label, then the choice and a chevron; the list drops under it.
export function Picker<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; name: string }[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false)
  const root = useDismiss(open, () => setOpen(false))
  const current = options.find((o) => o.id === value)
  return (
    <div className="pill-sel" ref={root}>
      <button className={`drop ${open ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="pl">{label}</span><span>{current?.name}</span><ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu dropmenu" role="listbox">
          {options.map((o) => (
            <button key={o.id} role="option" aria-selected={o.id === value} onClick={() => { onChange(o.id); setOpen(false) }}>
              <span>{o.name}</span>{o.id === value && <Check size={15} className="ck" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface MenuItem { label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; onClick: () => void }

// A button that opens a list of actions (the "..." beside Play).
export function MenuButton({ label, icon, items, className, up }: { label: string; icon: ReactNode; items: (MenuItem | null)[]; className?: string; up?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useDismiss(open, () => setOpen(false))
  const list = items.filter((i): i is MenuItem => !!i)
  return (
    <div className="menu-wrap" ref={root}>
      <button className={className} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{icon}</button>
      {open && (
        <div className={`menu actmenu ${up ? 'up' : ''}`} role="menu">
          {list.map((i) => (
            <button key={i.label} role="menuitem" className={i.danger ? 'danger' : ''} disabled={i.disabled} onClick={() => { setOpen(false); i.onClick() }}>
              {i.icon}<span>{i.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// One choice out of a few, as a segmented bar whose chosen part is solid.
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; name: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === value} onClick={() => onChange(o.id)}>{o.name}</button>
      ))}
    </div>
  )
}

// A labelled on/off switch in a pill.
export function Toggle({ label, on, onChange, icon }: { label: string; on: boolean; onChange: (v: boolean) => void; icon?: ReactNode }) {
  return (
    <button className="toggle" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      {icon}{label}<span className="switch" />
    </button>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}
