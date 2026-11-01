// The test lab: builds the window, starts it through tauri-driver against a sandbox (sandbox.mjs) with local servers,
// and clicks through every feature the way a player would, checking what reached the fake player, the sandbox's
// settings.json and the fake game folder.
//
//   node tests/lab/lab.mjs [--no-build] [--keep] [--only name,name]
//
// Needs: tauri-driver (cargo install tauri-driver --locked), Microsoft Edge WebDriver matching WebView2 (MSEDGEDRIVER,
// or %LOCALAPPDATA%\fl-lab\edgedriver-<version>\msedgedriver.exe), and the C++ launcher's Debug build (FL_LAUNCHER_EXE,
// default ..\flash-launcher-multiplayer\build\Debug), whose launcher_tests.exe is the fake player.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORTS, makeSandbox, snapshot } from './sandbox.mjs'
import { relayClient, startServers } from './servers.mjs'
import { Driver, button, q, waitFor } from './webdriver.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const tauriDir = resolve(here, '..', '..')
const argv = process.argv.slice(2)
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null
const FAKE_MS = 10000  // how long the fake game stays open: long enough to host, short enough to come back

function need(path, what) {
  if (!path || !existsSync(path)) {
    console.error(`The lab needs ${what}${path ? ` (not found: ${path})` : ''}.`)
    process.exit(2)
  }
  return path
}

const launcher = need(process.env.FL_LAUNCHER_EXE ?? resolve(tauriDir, '..', '..', 'flash-launcher-multiplayer', 'build', 'Debug', 'MultiplayerEverythingLauncher.exe'),
  'the C++ launcher (set FL_LAUNCHER_EXE)')
const fakePlayer = need(join(dirname(launcher), 'launcher_tests.exe'), 'launcher_tests.exe next to the launcher')
const edgeDir = join(process.env.LOCALAPPDATA ?? '', 'fl-lab')
const edgeDriver = need(process.env.MSEDGEDRIVER ??
  (existsSync(edgeDir) ? readdirSync(edgeDir).filter((d) => d.startsWith('edgedriver-')).map((d) => join(edgeDir, d, 'msedgedriver.exe')).find(existsSync) : undefined),
  'msedgedriver.exe (set MSEDGEDRIVER)')
const targetDir = process.env.CARGO_TARGET_DIR ?? join(tauriDir, 'src-tauri', 'target')

if (!argv.includes('--no-build')) {
  console.log('Building the window (tauri build --debug --no-bundle)...')
  const b = spawnSync('npx tauri build --debug --no-bundle', { cwd: tauriDir, shell: true, stdio: 'inherit' })
  if (b.status !== 0) process.exit(b.status ?? 1)
}
const app = need(join(targetDir, 'debug', 'app.exe'), 'the built window')

const work = join(tmpdir(), `fl-tauri-lab-${process.pid}`)
const box = makeSandbox(work, fakePlayer)
const gameBefore = snapshot(box.gameDir)
const stopServers = startServers(work, PORTS)
const fails = join(work, 'fails')

const env = {
  ...process.env,
  FL_LAUNCHER_EXE: launcher, FL_LAUNCHER_CONFIG: box.config, FL_FAKE_OUT: box.args, FL_FAKE_MS: String(FAKE_MS),
  FL_NO_NAME_PROMPT: '1', FL_NO_SITE: '1',
}
const driverProc = spawn('tauri-driver', ['--port', '4444', '--native-driver', edgeDriver], { env, stdio: 'ignore' })
const wd = new Driver('http://127.0.0.1:4444')

let passed = 0
let failed = 0
async function check(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}`)
    return
  }
  failed++
  console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`)
  const errors = await wd.exec('return window.__labErrors ?? []').catch(() => [])
  if (errors.length) console.log(`        page errors: ${errors.join(' | ')}`)
  try {
    mkdirSync(fails, { recursive: true })
    writeFileSync(join(fails, `${failed}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`), Buffer.from(await wd.screenshot(), 'base64'))
  } catch {
    // A screenshot is a help, not a requirement.
  }
}

// ---- reading the sandbox ---------------------------------------------------------------------------------------
const settings = () => JSON.parse(readFileSync(box.settings, 'utf8'))
const clearArgs = () => rmSync(box.args, { force: true })
// What the fake player was started with, once it has been.
const launchedWith = async () => (await waitFor(() => existsSync(box.args) && readFileSync(box.args, 'utf8').trim(), 10000) || '').split(/\r?\n/)
const clipboard = () => execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard'], { encoding: 'utf8' }).trim()

// ---- moving around the window ------------------------------------------------------------------------------------
const nav = (label) => `//nav[contains(@class,'navs')]//button[.//span[contains(@class,'lbl') and normalize-space(.)=${q(label)}]]`
const card = (name) => `//button[contains(@class,'card-c')][.//span[contains(@class,'name') and normalize-space(.)=${q(name)}]]`
// A panel button by its label (its first line), whatever glyph comes before it.
const panel = (label) => `//aside[contains(@class,'dpanel')]//button[.//span[normalize-space(.)=${q(label)}]]`
const inDialog = (label) => `//div[@role='dialog']${button(label)}`
const pill = () => wd.exec("return document.querySelector('.spill')?.textContent ?? ''")
const toast = () => wd.exec("return [...document.querySelectorAll('.isl.note')].map(e => e.textContent).join(' ')")
const key = (k) => wd.exec(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`)
const labPick = (path) => wd.exec('window.__flLabPick = arguments[0]', path)

async function openGame(name) {
  await wd.click(nav('All games'))
  await wd.click(card(name))
  await wd.find(`//h1[@aria-label=${q(name)}]`)
}
async function launch(label) {
  clearArgs()
  await wd.click(panel(label))
  return launchedWith()
}
const isMinimized = () =>
  wd.execAsync("const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke('plugin:window|is_minimized', { label: 'main' }).then(done, () => done(null))")

// ---- the scenarios ---------------------------------------------------------------------------------------------
const scenarios = {
  async library() {
    const counts = await waitFor(async () => {
      const c = await wd.exec("return Object.fromEntries([...document.querySelectorAll('.navs .nav')].map(b => [b.querySelector('.lbl')?.textContent, b.querySelector('.n')?.textContent ?? '']))")
      return c['All games'] === '6' && c
    })
    await check('the sidebar counts every game', !!counts, JSON.stringify(counts))
    await check('the sidebar counts each category', counts && counts['Flash mods'] === '5' && counts['PC mods'] === '1' && counts['Online multiplayer'] === '3')
    await wd.click(nav('Flash mods'))
    await check('a category shows its games', (await waitFor(async () => (await wd.count("//button[contains(@class,'card-c')]")) === 5)) === true)
    await wd.click(nav('All games'))
    await wd.type("//input[@placeholder='Search games and mods']", 'relay')
    const found = await waitFor(async () => (await wd.exec("return [...document.querySelectorAll('.card-c .name')].map(e => e.textContent)")).join('|') === 'Relay Test')
    await check('search finds a game by name', !!found)
    await wd.click("//button[@aria-label='Clear the search']")
    await wd.click(button('A to Z'))
    const names = await waitFor(async () => {
      const n = await wd.exec("return [...document.querySelectorAll('.card-c .name')].map(e => e.textContent)")
      return n.length === 6 && n
    })
    await check('A to Z sorts by name', !!names && names.join('|') === [...names].sort((a, b) => a.localeCompare(b)).join('|'), names?.join(', '))
    await wd.exec('location.reload()')
    await wd.find("//nav[contains(@class,'navs')]", 15000)
    await wd.click(nav('All games'))
    const kept = await waitFor(() => wd.exec("return document.querySelector('[role=radiogroup] [aria-checked=true]')?.textContent"), 10000)
    await check('the sort order is kept after a restart', kept === 'A to Z', String(kept))
  },

  async rooms() {
    await wd.click(nav('Rooms'))
    await check('Open rooms lists the server\'s rooms', (await waitFor(async () => (await wd.count("//div[contains(@class,'row-card')]")) >= 2, 10000)) === true)
    await check('a full room offers no Join', (await wd.count(`//div[contains(@class,'row-card')]${button('Full')}`)) >= 1)
    clearArgs()
    await wd.click(`//div[contains(@class,'row-card')][.//*[normalize-space(.)='Co-op Test']]${button('Join')}`)
    const a = await launchedWith()
    await check('Join on a room joins it with its code', a.includes('--coop-join-relay') && a.includes('ABCDE') && a.includes(`127.0.0.1:${PORTS.rooms}`), a.join(' '))
  },

  async coop() {
    await openGame('Co-op Test')
    await wd.click(panel('Host a game'))
    clearArgs()
    await wd.click(inDialog('Host'))
    let a = await launchedWith()
    await check('Host a game hosts a room for 2', a.includes('--coop-host-relay') && a.join(' ').includes('--coop-players 2'), a.join(' '))
    await wd.click(panel('Host a game'))
    await wd.click(inDialog('3 players'))
    clearArgs()
    await wd.click(inDialog('Host'))
    a = await launchedWith()
    await check('Host for 3 players picks the 3-player room', a.join(' ').includes('--coop-players 3'), a.join(' '))
    await wd.click(panel('Join a game'))
    clearArgs()
    await wd.type("//input[@id='join-code']", 'qw3rt')
    a = await launchedWith()
    await check('Join with a code sends it in capitals', a.includes('--coop-join-relay') && a.includes('QW3RT'), a.join(' '))
    await wd.click("//button[contains(normalize-space(.),'Other ways to connect')]")
    a = await launch('Host with your IP (2 players)')
    await check('Host with your IP hosts directly', a.join(' ').includes('--coop-host 7790'), a.join(' '))
    await wd.click(panel('Join by IP'))
    clearArgs()
    await wd.type("//input[@id='join-code']", '192.168.1.20:7790')
    a = await launchedWith()
    await check('Join by IP connects to the address', a.join(' ').includes('--coop-join 192.168.1.20:7790'), a.join(' '))
    await check('Play solo is hidden while offline play is off', (await wd.count(panel('Play solo'))) === 0)
    await wd.click(panel('Favorite'))
    await check('Favorite is saved', (await waitFor(() => settings().games?.coop?.favorite === true)) === true)
    await wd.click(panel('Guide'))
    await check('Guide opens the How to play tab', (await wd.exec("return document.querySelector('.ptabs [aria-selected=true]')?.textContent")) === 'How to play')
    await key('Escape')
    await check('Esc goes back to the list', !!(await waitFor(async () => (await wd.count("//button[contains(@class,'card-c')]")) > 0)))
  },

  async favorites() {
    await wd.click(nav('Favorites'))
    const h = await waitFor(() => wd.exec("const c = document.querySelector('.card-c'); return c && c.getBoundingClientRect().height"))
    await check('the Favorites list shows the favorite', (await wd.count(card('Co-op Test'))) === 1)
    await check('a selected card keeps its full size', h > 150, `height ${h}`)
  },

  async settings() {
    await wd.click("//button[contains(@class,'setbtn')]")
    await wd.click("//button[@role='switch' and contains(@aria-label,'offline')]")
    await check('Show offline play is saved', (await waitFor(() => settings().showOffline === true)) === true)
    await wd.type("//div[contains(@class,'set-row')][.//b[normalize-space(.)='Your name']]//input", 'Tester2')
    await check('Your name is saved', (await waitFor(() => settings().playerName === 'Tester2')) === true)
    await openGame('Co-op Test')
    const a = await launch('Play solo')
    await check('Play solo starts the game on its own', a.length === 1 && a[0].endsWith('coop.swf'), a.join(' '))
    await wd.click(panel('Host a game'))
    clearArgs()
    await wd.click(inDialog('Host'))
    const h = await launchedWith()
    await check('the new name reaches the game', h.join(' ').includes('--coop-name Tester2'), h.join(' '))
  },

  async minimize() {
    await wd.click("//button[contains(@class,'setbtn')]")
    await wd.click("//button[@role='switch' and contains(@aria-label,'Minimize')]")
    await check('Minimize while a game runs is saved', (await waitFor(() => settings().minimize === 1 || settings().minimize === true)) === true)
    await openGame('Relay Test')
    await launch('Play')
    await check('the window minimizes while the game runs', (await waitFor(async () => (await isMinimized()) === true, 5000)) === true)
    await check('the window comes back when the game closes', (await waitFor(async () => (await isMinimized()) === false, FAKE_MS + 8000)) === true)
    await wd.click("//button[contains(@class,'setbtn')]")
    await wd.click("//button[@role='switch' and contains(@aria-label,'Minimize')]")
    await waitFor(() => !settings().minimize)
  },

  async hosting() {
    await openGame('Relay Test')
    await launch('Host with the relay')
    const box1 = await waitFor(() => wd.exec("return document.querySelector('.card.pinned')?.textContent"), 10000)
    await check('hosting shows the hosting box with its port', !!box1 && box1.includes(String(PORTS.relay)), box1)
    const gameSide = await relayClient(PORTS.relay, 'H', 'Tester2')
    const friend = await relayClient(PORTS.relay, 'J', 'Friend One')
    await check('a friend who joins is listed', !!(await waitFor(async () => (await wd.exec("return document.querySelector('.card.pinned')?.textContent ?? ''")).includes('Friend One'), 6000)))
    await check('the friend fills the P2 slot', !!(await waitFor(async () => (await wd.exec("return [...document.querySelectorAll('.pslot')].map(e => e.textContent).join('|')")).includes('Friend One'))))
    const addr = await wd.exec("return document.querySelector('.card.pinned .linkbtn')?.textContent")
    await wd.click("//div[contains(@class,'pinned')]//button[contains(@class,'linkbtn')]")
    await check('Copy puts the address on the clipboard', (await waitFor(() => clipboard() === addr, 4000)) === true, `${clipboard()} vs ${addr}`)
    friend.close()
    gameSide.close()
    await wd.click(button('Stop hosting'))
    await check('Stop hosting closes the box', (await waitFor(async () => !(await wd.exec("return !!document.querySelector('.card.pinned')")), 6000)) === true)
    await check('Stop hosting says so', (await waitFor(async () => (await toast()).includes('Hosting stopped'))) === true)
  },

  async download() {
    await openGame('Download Test')
    await check('a missing file says so', (await waitFor(async () => (await pill()).includes('missing'))) === true, await pill())
    await wd.click(panel('Download game files'))
    await check('Download fetches the file from the catalog', (await waitFor(async () => (await pill()).includes('Ready'), 20000)) === true, await pill())
    const file = join(work, 'games', 'dl.swf')
    await check('the downloaded file is in the games folder', existsSync(file) && readFileSync(file, 'utf8') === 'pretend game file')
  },

  async locate() {
    await openGame('Locate Test')
    const copy = join(work, 'elsewhere', 'my copy.swf')
    await labPick(copy)
    await wd.click(panel('Locate the game file'))
    await check('Locate makes the game ready', (await waitFor(async () => (await pill()).includes('Ready'), 10000)) === true, await pill())
    await labPick(undefined)
    const s = JSON.stringify(settings().games?.locgame ?? {})
    await check('the located file is saved for the game', s.includes('my copy.swf'), s)
    const a = await launch('Play')
    await check('Play uses the located file', a.some((x) => x.endsWith('my copy.swf')), a.join(' '))
  },

  async mods() {
    await openGame('Fake Game')
    await check('a missing PC game says so', (await waitFor(async () => (await pill()).includes('not found'), 15000)) === true, await pill())
    await labPick(box.gameDir)
    await wd.click(panel('Choose the game folder'))
    await labPick(undefined)
    const ready = await waitFor(async () => wd.exec("return [...document.querySelectorAll('.dpanel .pbtn')].some(b => b.textContent.includes('Install') && !b.disabled)"), 15000)
    await check('Choose the game folder finds the game', ready === true)
    await wd.click(panel('Install Fake Game'))
    await check('Install finishes', !!(await waitFor(async () => (await wd.count(panel('Repair'))) === 1, 30000)))
    const dat = join(box.gameDir, 'Data', 'original.dat')
    await check('Install puts the mod\'s files in the game folder', readFileSync(dat, 'utf8') === 'MODDED 1.0.0' && existsSync(join(box.gameDir, 'Mods', 'mod-test', 'Mod.dll')))
    await check('the mod shows as installed', (await waitFor(async () => (await pill()).includes('Installed'), 10000)) === true, await pill())
    rmSync(join(box.gameDir, 'Mods', 'mod-test', 'Mod.dll'))
    await wd.click(panel('Repair'))
    await check('Repair puts back a deleted file', (await waitFor(() => existsSync(join(box.gameDir, 'Mods', 'mod-test', 'Mod.dll')), 30000)) === true)
    await waitFor(async () => (await wd.count(panel('Uninstall'))) === 1, 30000)
    await wd.click(panel('Uninstall'))
    await wd.click(inDialog('Uninstall'))
    await check('Uninstall finishes', !!(await waitFor(async () => wd.exec("return [...document.querySelectorAll('.dpanel .pbtn')].some(b => b.textContent.includes('Install'))"), 30000)))
    await check('Uninstall leaves the game folder exactly as it was', snapshot(box.gameDir) === gameBefore)
  },

  async lobby() {
    await openGame('Lobby Test')
    await wd.click(panel('Play online'))
    await wd.find("//h1[starts-with(normalize-space(.),'Play')]")
    await wd.click("//button[@role='switch' and @aria-label='Direct IP']")
    await wd.type("//input[@type='number']", String(PORTS.lobby))
    await wd.click(button('Host room'))
    const me = await waitFor(() => wd.exec("return [...document.querySelectorAll('.slot-name')].map(e => e.textContent).join('|')"), 15000)
    await check('hosting a lobby room lists you in it', !!me && me.includes('(you)'), me)
    await wd.type("//input[@placeholder='Say something']", 'hello lab')
    await check('chat reaches the room', !!(await waitFor(async () => (await wd.exec("return document.querySelector('.chat-lines')?.textContent ?? ''")).includes('hello lab'), 8000)))
    await wd.click(button('Leave room'))
    await check('Leave room goes back to the game', !!(await waitFor(() => wd.exec("return document.querySelector('h1')?.getAttribute('aria-label')"))))
  },

  async stats() {
    // A game played and closed, so the play is counted.
    await openGame('Relay Test')
    await launch('Play')
    await waitFor(() => (settings().games?.relaygame?.plays ?? 0) > 0, FAKE_MS + 8000)
    await openGame('Relay Test')
    const played = await wd.exec("return [...document.querySelectorAll('.stats > div')].find(d => d.querySelector('span')?.textContent === 'Played')?.querySelector('b')?.textContent")
    await check('Played never says Not yet after a game was played', played && played !== 'Not yet', played)
  },
}

// ---- run ---------------------------------------------------------------------------------------------------------
let code = 0
try {
  await waitFor(() => fetch('http://127.0.0.1:4444/status').then((r) => r.ok), 10000)
  await wd.start(app)
  await wd.find("//nav[contains(@class,'navs')]", 30000)
  // Errors the page throws (a crash leaves it blank), kept for the FAIL lines.
  await wd.exec(`window.__labErrors = []
    addEventListener('error', (e) => window.__labErrors.push(e.message + ' @ ' + String(e.error?.stack ?? '').split(String.fromCharCode(10)).slice(1, 4).join(' < ')))
    addEventListener('unhandledrejection', (e) => window.__labErrors.push(String(e.reason)))`)
  for (const [name, run] of Object.entries(scenarios)) {
    if (only && !only.includes(name)) continue
    console.log(`\n${name}`)
    try {
      await run()
    } catch (e) {
      await check(`${name} ran to the end`, false, e.message)
    }
  }
  console.log(`\n${passed} passed, ${failed} failed${failed ? ` (screenshots in ${fails})` : ''}`)
  code = failed ? 1 : 0
} catch (e) {
  console.error(`The lab couldn't start: ${e.message}`)
  const shown = await wd.exec('return location.href + "\\n" + document.body.innerText.slice(0, 600)').catch((x) => `(no page: ${x.message})`)
  console.error(`The window showed: ${shown}`)
  code = 2
} finally {
  await wd.stop()
  driverProc.kill()
  stopServers()
  if (!argv.includes('--keep') && !failed) {
    // A fake game may still hold a file for a few seconds; a sandbox left in %TEMP% is harmless.
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 })
    } catch {
      console.log(`Sandbox left for later: ${work}`)
    }
  } else console.log(`Sandbox kept: ${work}`)
}
process.exit(code)
