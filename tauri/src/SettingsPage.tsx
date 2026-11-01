// Settings, as the C++ Settings window has them: each change is saved at once to the launcher's own settings.json,
// so both windows agree.
import { useState } from 'react'
import { open, pickFolder, setSetting, type Library, type Settings } from './api'

export function SettingsPage({ lib, onChanged, onClose }: { lib: Library; onChanged: (s: Partial<Settings>) => void; onClose: () => void }) {
  const t = (k: string, fallback: string) => (lib.text[k] ?? fallback).replace('${VERSION}', lib.launcherVersion).replace(/…|…/g, '...')
  const u = lib.user
  const [name, setName] = useState(u.playerName)
  const [error, setError] = useState('')

  const save = (key: keyof Settings, value: string | boolean) => {
    setError('')
    setSetting(key, value)
      .then(() => onChanged({ [key]: value }))
      .catch((e) => setError(String(e)))
  }
  const check = (key: 'minimize' | 'online' | 'showOffline' | 'showOriginals' | 'autoUpdate', label: string) => (
    <label className="check-row">
      <input type="checkbox" checked={u[key]} onChange={(e) => save(key, e.target.checked)} />
      <span>{label}</span>
    </label>
  )
  const commitName = () => {
    const v = name.trim()
    if (v !== u.playerName) save('playerName', v)
  }
  const gamesDir = u.gamesDir || lib.defaultGamesDir || lib.gamesDir
  const logDir = lib.logFile.replace(/[\\/][^\\/]*$/, '')

  return (
    <div className="settings enter-right">
      <div className="settings-head">
        <h2>{t('settings.title', 'Settings')}</h2>
        <button className="btn quiet" onClick={onClose}>{t('settings.close', 'Close')}</button>
      </div>

      <section className="card-panel settings-group">
        <h4>{t('settings.playing', 'Playing')}</h4>
        {check('minimize', t('settings.minimize', 'Minimize the launcher while a game runs'))}
        <label className="field inline">
          <span>{t('settings.player', 'Default player')}</span>
          <select value={u.defaultPlayer} onChange={(e) => save('defaultPlayer', e.target.value)}>
            <option value="">Automatic</option>
            {lib.players.map((p) => <option key={p.id} value={p.id}>{p.name}{p.found ? '' : '  (not found)'}</option>)}
          </select>
        </label>
        {check('showOffline', t('settings.offline', 'Show offline play (solo and one keyboard)'))}
        {check('showOriginals', t('settings.originals', 'Show the original versions of modded games'))}
      </section>

      <section className="card-panel settings-group">
        <h4>{t('settings.online', 'Online')}</h4>
        {check('online', t('settings.onlineToggle', 'Show open rooms and check for game updates'))}
        <p className="muted small">{t('settings.onlineNote', '')}</p>
        {check('autoUpdate', t('settings.autoUpdate', 'Update the launcher automatically'))}
        <label className="field">
          <span>{t('settings.name', 'Your name')}</span>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} />
        </label>
        <p className="muted small">{t('settings.nameNote', '')}</p>
      </section>

      <section className="card-panel settings-group">
        <h4>{t('settings.folders', 'Folders')}</h4>
        <div className="folder-row">
          <span className="folder-label">{t('settings.gamesDir', 'Game files')}</span>
          <span className="folder-path" title={gamesDir}>{gamesDir}</span>
        </div>
        <div className="button-row">
          <button className="btn quiet" onClick={async () => {
            const dir = await pickFolder(t('settings.pickFolder', 'Choose the folder for game files'), gamesDir)
            if (dir) save('gamesDir', dir)
          }}>{t('settings.change', 'Change...')}</button>
          <button className="btn quiet" disabled={!gamesDir} onClick={() => open(gamesDir).catch((e) => setError(String(e)))}>{t('settings.open', 'Open')}</button>
          <button className="btn quiet" disabled={!u.gamesDir} onClick={() => save('gamesDir', '')}>{t('settings.reset', 'Use default')}</button>
          <button className="btn quiet" disabled={!logDir} onClick={() => open(logDir).catch((e) => setError(String(e)))}>{t('settings.log', 'Open log folder')}</button>
        </div>
      </section>

      <div className="settings-foot">
        <span className="muted">{t('settings.about', 'Multiplayer Everything Launcher')}</span>
        {lib.website && <button className="btn quiet" onClick={() => open(lib.website)}>{t('settings.github', 'Project page')}</button>}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
