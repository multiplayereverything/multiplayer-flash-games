// A game's lobby: host or join a room, see who is in it, chat, get ready, and the host starts; the C++ launcher runs
// the room (--lobby-session) and opens the game for each player when it starts.
import { useEffect, useRef, useState } from 'react'
import {
  copyText, lobbySend, lobbyStart, onLobby, type Game, type Library, type LobbyRequest, type LobbySnapshot,
} from './api'

export function LobbyPage({ game, lib, onClose }: { game: Game; lib: Library; onClose: () => void }) {
  const t = (k: string, fallback: string, vars: Record<string, string> = {}) =>
    Object.entries(vars).reduce((s, [key, v]) => s.replace('${' + key + '}', v), lib.text[k] ?? fallback)
  const [room, setRoom] = useState<LobbySnapshot | null>(null)
  const [open, setOpen] = useState(false)  // a session is running
  const [note, setNote] = useState('')
  const [tab, setTab] = useState<'host' | 'join'>('host')
  const [direct, setDirect] = useState(false)
  const [roomName, setRoomName] = useState(`${lib.user.playerName || 'My'}'s room`)
  const [maxPlayers, setMaxPlayers] = useState(Math.max(2, game.maxPlayers || 4))
  const [isPublic, setPublic] = useState(true)
  const [password, setPassword] = useState('')
  const [port, setPort] = useState(7790)
  const [target, setTarget] = useState('')
  const [chat, setChat] = useState('')
  const chatEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = onLobby((e) => {
      if (e.game !== game.id) return
      const m = e.message
      if (m.t === 'snapshot') {
        setRoom(m)
        if (m.reason) setNote(m.reason)
      } else if (m.t === 'error') setNote(m.message)
      else if (m.t === 'game') setNote(m.state === 'started' ? 'The game is starting...' : m.state === 'exited' ? 'Back in the room.' : m.message || 'The game could not start.')
      else if (m.t === 'closed') {
        if (m.reason) setNote(m.reason)
        setRoom(null)
      } else if (m.t === 'ended') {
        setOpen(false)
        setRoom(null)
      }
    })
    return () => {
      off.then((f) => f())
    }
  }, [game.id])

  // Leaving the page leaves the room.
  useEffect(() => () => void lobbySend({ op: 'leave' }).catch(() => {}), [])

  useEffect(() => chatEnd.current?.scrollIntoView({ block: 'nearest' }), [room?.chat.length])

  const start = (request: LobbyRequest) => {
    setNote('')
    lobbyStart(game.id, request)
      .then(() => setOpen(true))
      .catch((e) => setNote(String(e)))
  }
  const host = () => start({ op: 'host', direct, roomName: roomName.trim(), password, public: isPublic, maxPlayers, port })
  const join = () => {
    const code = target.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (direct) start({ op: 'join', direct: true, address: target.trim(), password })
    else if (code.length !== 5) setNote(t('lobby.badCode', 'A room code has five letters and digits.'))
    else start({ op: 'join', direct: false, code, password })
  }
  const send = () => {
    const text = chat.trim()
    if (!text) return
    lobbySend({ op: 'chat', text }).catch((e) => setNote(String(e)))
    setChat('')
  }

  const me = room?.players.find((p) => p.you)
  const everyoneReady = !!room && room.players.filter((p) => p.connected && !p.host).every((p) => p.ready) && room.players.length > 1

  return (
    <div className="lobby enter-right">
      <div className="settings-head">
        <h2>{t('lobby.title', 'Play ${GAME} online', { GAME: game.name })}</h2>
        <button className="btn quiet" onClick={() => { if (open) void lobbySend({ op: 'leave' }); onClose() }}>{open ? 'Leave room' : 'Back'}</button>
      </div>

      {!open && (
        <>
          <p className="muted">{t('lobby.subtitle', '')}</p>
          <div className="tabs lobby-tabs" role="tablist">
            {(['host', 'join'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
                {k === 'host' ? t('lobby.hostHead', 'Host a room') : t('lobby.joinHead', 'Join a room')}
              </button>
            ))}
          </div>
          <section className="card-panel settings-group">
            <label className="check-row">
              <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
              <span>{t('lobby.direct', 'Direct IP (Radmin VPN, ZeroTier, LAN) instead of the server')}</span>
            </label>
            {tab === 'host' ? (
              <>
                <label className="field"><span>{t('lobby.roomName', 'Room name')}</span><input value={roomName} maxLength={40} onChange={(e) => setRoomName(e.target.value)} /></label>
                <label className="field inline">
                  <span>{t('lobby.players', 'Players')}</span>
                  <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
                    {Array.from({ length: Math.max(1, (game.maxPlayers || 4) - 1) }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                {!direct && (
                  <label className="check-row"><input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} /><span>{t('lobby.public', 'List it in Open rooms')}</span></label>
                )}
                <label className="field"><span>{t('lobby.password', 'Password (optional)')}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
                {direct && (
                  <label className="field inline"><span>{t('lobby.port', 'Port')}</span><input type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} /></label>
                )}
                <div className="button-row"><button className="btn center primary" onClick={host}>{t('lobby.host', 'Host room')}</button></div>
              </>
            ) : (
              <>
                <label className="field">
                  <span>{direct ? t('lobby.address', "Host's address") : t('lobby.code', 'Room code')}</span>
                  <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && join()} placeholder={direct ? '192.168.1.20:7790' : 'ABCDE'} spellCheck={false} />
                </label>
                <label className="field"><span>{t('lobby.joinPassword', 'Password, if it has one')}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
                <div className="button-row"><button className="btn center primary" onClick={join}>Join room</button></div>
              </>
            )}
          </section>
        </>
      )}

      {open && !room && <p className="muted">Connecting...</p>}

      {room && (
        <div className="lobby-room">
          <section className="card-panel">
            <div className="room-head">
              <div>
                <span className="kicker">{room.direct ? 'Direct IP' : 'Room code'}</span>
                <div className="room-code">{room.code || '...'}</div>
                <span className="muted">{room.roomName}{room.reconnecting ? '  (reconnecting...)' : ''}</span>
              </div>
              {room.code && <button className="btn quiet" onClick={() => copyText(room.code).then(() => setNote('Copied.'))}>Copy</button>}
            </div>
            <div className="lobby-slots">
              {Array.from({ length: room.maxPlayers }, (_, slot) => {
                const p = room.players.find((x) => x.slot === slot)
                return (
                  <div key={slot} className={`lobby-slot ${p ? 'taken' : 'open'}`} style={{ ['--p' as string]: lib.branding.playerColors[slot % lib.branding.playerColors.length] }}>
                    <span className="slot-tag">P{slot + 1}</span>
                    <span className="slot-name">{p ? `${p.name}${p.you ? ' (you)' : ''}` : 'Open'}</span>
                    {p && <span className={`slot-state ${p.ready || p.host ? 'ready' : ''}`}>{p.host ? 'Host' : !p.connected ? 'Dropped' : p.ready ? 'Ready' : 'Not ready'}{p.ping >= 0 ? `  ${p.ping} ms` : ''}</span>}
                    {p && room.host && !p.you && (
                      <button className="btn quiet kick" onClick={() => lobbySend({ op: 'kick', slot, ban: false })}>Kick</button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="button-row">
              {room.host ? (
                <button className="btn center primary" disabled={!everyoneReady || room.phase !== 'lobby'} onClick={() => lobbySend({ op: 'start' })}>
                  {t('lobby.start', 'Start game')}
                </button>
              ) : (
                <button className={`btn center ${me?.ready ? '' : 'primary'}`} disabled={room.phase !== 'lobby'} onClick={() => lobbySend({ op: 'ready', v: !me?.ready })}>
                  {me?.ready ? 'Not ready' : t('lobby.ready', 'Ready')}
                </button>
              )}
            </div>
          </section>
          <section className="card-panel lobby-chat">
            <div className="chat-lines">
              {room.chat.map((c, i) => (
                <div key={i} className={c.slot < 0 ? 'chat-system' : ''}>{c.slot >= 0 && <strong>{c.name}: </strong>}{c.text}</div>
              ))}
              <div ref={chatEnd} />
            </div>
            <div className="chat-input">
              <input value={chat} maxLength={200} placeholder="Say something" onChange={(e) => setChat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
              <button className="btn quiet" onClick={send}>Send</button>
            </div>
          </section>
        </div>
      )}
      {note && <p className="lobby-note">{note}</p>}
    </div>
  )
}
