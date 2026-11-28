/** Homebridge-managed AirPlay receivers backed by the existing Yoto account. */
import { spawn, execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import { startMediaRemoteBridge } from './mediaremote-bridge.js'
import { generatePin, isValidPin } from './utils/native-controls-pin.js'
/** @import { Logger } from 'homebridge' */
/** @import { YotoDeviceModel } from 'yoto-nodejs-client' */
/** @import { ChildProcess } from 'node:child_process' */
/** @import { NetworkInterfaceInfo } from 'node:os' */

const execute = promisify(execFile)
const receiver = fileURLToPath(new URL('../experiments/mediaremote/receiver.py', import.meta.url))
const requirements = fileURLToPath(new URL('../experiments/mediaremote/requirements.txt', import.meta.url))

/** Default first receiver port. macOS AirPlay Receiver already listens on 7000. */
export const DEFAULT_NATIVE_CONTROLS_PORT = 7100
/** Ports in the default range: one per receiver plus two per connected iPhone. */
export const DEFAULT_NATIVE_CONTROLS_PORT_COUNT = 100
/** Environment variable that hands the pairing PIN to each receiver (kept out of argv). */
export const PIN_ENV = 'YOTO_NATIVE_CONTROLS_PIN'
/** Output lines kept per receiver, to explain an unexpected exit. */
const RECENT_LINES = 10

/**
 * Interface name prefixes for container, VM and VPN bridges. With Docker host
 * networking these show up next to the real LAN interface.
 */
const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|vmnet|cni|flannel|podman|lxcbr|lxdbr|vnet|tun|tap|wg|zt|tailscale|utun)/

/** @param {unknown} value */
export function getNativeControlsConfig (value) {
  const config = value && typeof value === 'object'
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
  const port = config['port'] ?? DEFAULT_NATIVE_CONTROLS_PORT
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Native controls port must be between 1024 and 65535')
  const lastPort = config['lastPort'] ?? Math.min(65535, port + DEFAULT_NATIVE_CONTROLS_PORT_COUNT - 1)
  if (typeof lastPort !== 'number' || !Number.isInteger(lastPort) || lastPort < port || lastPort > 65535) throw new Error('Native controls last port must be between the first port and 65535')
  const address = config['address']
  if (address !== undefined && typeof address !== 'string') throw new Error('Native controls address must be an IPv4 address')
  const python = config['pythonPath'] ?? 'python3'
  if (typeof python !== 'string' || !python) throw new Error('Native controls Python path must be a string')
  const devices = config['devices'] ?? []
  if (!Array.isArray(devices) || !devices.every(x => typeof x === 'string')) throw new Error('Native controls devices must be player names or IDs')
  const rawPin = config['pin']
  const pin = typeof rawPin === 'string' ? rawPin.trim() : rawPin
  if (pin !== undefined && pin !== '' && !isValidPin(pin)) throw new Error('Native controls pairing PIN must be 4 to 32 characters without spaces')
  const open = config['allowAnyoneOnNetwork'] ?? false
  if (typeof open !== 'boolean') throw new Error('Native controls "Allow anyone on my network" must be on or off')
  return {
    port,
    lastPort,
    address: address || undefined,
    python,
    devices: /** @type {string[]} */ (devices),
    pin: /** @type {string | undefined} */ (pin || undefined),
    allowAnyoneOnNetwork: open,
  }
}

/**
 * Interfaces that carry a default route, most preferred first. Hosts often have
 * several LAN interfaces at once (Ethernet and Wi-Fi on the same network); the
 * one the system routes through is the right one to advertise.
 * @returns {string[]}
 */
export function defaultRouteInterfaces () {
  try {
    if (process.platform === 'linux') return parseLinuxDefaultRoutes(readFileSync('/proc/net/route', 'utf8'))
    if (process.platform === 'darwin') {
      const output = execFileSync('/sbin/route', ['-n', 'get', 'default'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] })
      const name = /^\s*interface:\s*(\S+)/m.exec(output)?.[1]
      return name ? [name] : []
    }
  } catch { /* No route information: fall back to asking for the address. */ }
  return []
}

/**
 * Interfaces with a default route in /proc/net/route, lowest metric first.
 * @param {string} table
 * @returns {string[]}
 */
export function parseLinuxDefaultRoutes (table) {
  return table.split('\n').slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(([name, destination, , flags, , , , mask]) => name && destination === '00000000' && mask === '00000000' &&
      (Number.parseInt(flags ?? '0', 16) & 1) === 1)
    .sort((a, b) => Number(a[6]) - Number(b[6]))
    .map(([name]) => /** @type {string} */ (name))
}

/**
 * The LAN IPv4 address receivers bind to and advertise.
 *
 * Container, VM and VPN interfaces are ignored. If more than one LAN interface
 * remains, the one carrying the default route is used. Otherwise the user has to
 * choose, and the error lists what was found.
 * @param {string | undefined} configured
 * @param {NodeJS.Dict<NetworkInterfaceInfo[]>} [interfaces]
 * @param {() => string[]} [routes] - Default-route interfaces, most preferred first
 */
export function nativeControlsAddress (configured, interfaces = networkInterfaces(), routes = defaultRouteInterfaces) {
  const entries = Object.entries(interfaces).flatMap(([name, list]) =>
    (list ?? []).filter(entry => entry.family === 'IPv4' && !entry.internal).map(entry => ({ name, address: entry.address })))
  const found = entries.map(entry => `${entry.name} ${entry.address}`).join(', ') || 'none'
  if (configured) {
    if (!entries.some(entry => entry.address === configured)) throw new Error(`The Native Controls LAN address ${configured} is not assigned to this Homebridge host (found: ${found})`)
    return configured
  }
  const lan = entries.filter(entry => !VIRTUAL_INTERFACE.test(entry.name))
  const addresses = [...new Set(lan.map(entry => entry.address))]
  if (addresses.length === 1 && addresses[0]) return addresses[0]
  if (addresses.length > 1) {
    for (const name of routes()) {
      const routed = [...new Set(lan.filter(entry => entry.name === name).map(entry => entry.address))]
      if (routed.length === 1 && routed[0]) return routed[0]
    }
  }
  throw new Error(`Could not tell which network address iPhones should use. Set the LAN address under Advanced > Native iPhone Controls to this host's address on your home network (found: ${found})`)
}

/**
 * Whether a TCP port can be bound on `address` right now.
 * @param {number} port
 * @param {string} address
 * @returns {Promise<boolean>}
 */
export function isPortFree (port, address) {
  return new Promise(resolve => {
    const probe = createServer()
    probe.unref()
    probe.once('error', () => resolve(false))
    probe.listen({ port, host: address, exclusive: true }, () => probe.close(() => resolve(true)))
  })
}

/**
 * Receiver display names, made unique so two players called the same thing can
 * both be told apart in Control Center.
 * @param {Array<[string, string]>} players - [device ID, name]
 * @returns {Map<string, string>}
 */
export function uniquePlayerNames (players) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const [, name] of players) counts.set(name, (counts.get(name) ?? 0) + 1)
  return new Map(players.map(([id, name]) => [id, (counts.get(name) ?? 0) > 1 ? `${name} (${id.slice(-4)})` : name]))
}

/**
 * @param {string} python
 * @param {string} storage
 * @param {Logger} log
 * @param {AbortSignal} signal
 */
async function preparePython (python, storage, log, signal) {
  const runtime = join(storage, 'yoto-mediaremote-runtime')
  const executable = join(runtime, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const wanted = await readFile(requirements, 'utf8')
  try {
    if (await readFile(join(runtime, 'requirements-installed'), 'utf8') === wanted) {
      await execute(executable, ['-c', 'import pyatv, aiohttp, zeroconf'], { signal, timeout: 30000 })
      return executable
    }
  } catch { /* Create or repair the dedicated runtime below. */ }
  log.info('Preparing native iPhone controls (first startup may take a few minutes)...')
  await mkdir(storage, { recursive: true })
  await execute(python, ['-m', 'venv', runtime], { signal, timeout: 60000 })
  await execute(executable, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements],
    { signal, timeout: 300000, maxBuffer: 4 * 1024 * 1024 })
  await writeFile(join(runtime, 'requirements-installed'), wanted)
  return executable
}

/**
 * @typedef {Object} NativeControlsRuntime
 * @property {typeof preparePython} [prepare]
 * @property {typeof spawn} [spawn]
 * @property {typeof nativeControlsAddress} [address]
 * @property {typeof isPortFree} [portFree]
 * @property {(cardId: string) => string | null} [artwork]
 * @property {(cardId: string) => import('./utils/card-tracks.js').CardTrack[] | null} [tracks]
 * @property {(pin: string) => Promise<string>} [savePin] - Save a generated PIN to the plugin settings. Resolves to the PIN to use: one already saved wins over the new one.
 */

export class NativeControls {
  /** @type {import('node:http').Server | null} */ bridge = null
  /** @type {Map<string, { child: ChildProcess, port: number }>} */ children = new Map()
  /** @type {Map<string, number>} */ ports = new Map()
  /** @type {ReturnType<typeof setTimeout> | null} */ retry = null
  /** @type {Promise<void>} */ syncing = Promise.resolve()
  stopped = false
  controller = new AbortController()
  python = ''
  address = ''
  token = randomBytes(32).toString('hex')
  bridgeUrl = ''
  /** @type {string | undefined} */ pin

  /**
   * @param {unknown} config
   * @param {string} storage
   * @param {() => Map<string, YotoDeviceModel> | undefined} devices
   * @param {Logger} log
   * @param {NativeControlsRuntime} [runtime]
   */
  constructor (config, storage, devices, log, runtime = {}) {
    this.config = getNativeControlsConfig(config)
    this.storage = storage
    this.devices = devices
    this.log = log
    this.prepare = runtime.prepare ?? preparePython
    this.spawn = runtime.spawn ?? spawn
    this.resolveAddress = runtime.address ?? nativeControlsAddress
    this.portFree = runtime.portFree ?? isPortFree
    this.artwork = runtime.artwork
    this.tracks = runtime.tracks
    this.savePin = runtime.savePin
  }

  async start () {
    if (process.platform === 'win32') throw new Error('Native iPhone controls currently require Linux or macOS')
    this.address = this.resolveAddress(this.config.address)
    await this.resolvePin()
    try {
      this.python = await this.prepare(this.config.python, this.storage, this.log, this.controller.signal)
    } catch (error) {
      if (this.stopped) return
      throw new Error(`Could not set up Python. It needs Python 3 with venv and pip (on Debian, Ubuntu and Raspberry Pi OS: python3-venv and python3-pip): ${error instanceof Error ? error.message : String(error)}`)
    }
    if (this.stopped) return
    this.bridge = await startMediaRemoteBridge({ host: '127.0.0.1', port: 0, token: this.token }, this.devices, this.log, this.artwork, this.tracks)
    const address = this.bridge?.address()
    if (!address || typeof address === 'string') throw new Error('Native controls adapter did not start')
    this.bridgeUrl = `http://127.0.0.1:${address.port}`
    if (this.stopped) return this.stop()
    this.log.info(`Native iPhone controls use TCP ports ${this.config.port}-${this.config.lastPort} on ${this.address}. If this host runs a firewall, allow that range from your home network.`)
    await this.sync()
  }

  /** Use the configured PIN, or create and save one unless access is open. */
  async resolvePin () {
    if (this.config.allowAnyoneOnNetwork) {
      this.pin = undefined
      this.log.warn('Native iPhone controls: "Allow anyone on my network" is on, so any device on your network can control the selected Yotos without a PIN.')
      return
    }
    if (this.config.pin) {
      this.pin = this.config.pin
      return
    }
    const generated = generatePin()
    let pin = generated
    try {
      pin = this.savePin ? await this.savePin(generated) : generated
    } catch (error) {
      this.log.warn('Could not save the native controls pairing PIN; a new one will be generated next start:', error instanceof Error ? error.message : String(error))
    }
    if (!isValidPin(pin)) pin = generated
    this.pin = pin
    // Never log the PIN itself.
    this.log.info(pin === generated
      ? 'Native iPhone controls: generated a pairing PIN. Find it (or change it) in the plugin settings under Advanced > Native iPhone Controls, and enter it on your iPhone the first time it controls a Yoto.'
      : 'Native iPhone controls: using the pairing PIN saved in the plugin settings.')
  }

  /**
   * Start and stop receivers to match the selected players. Calls are queued so
   * port probing never races; failures are logged, never thrown.
   * @returns {Promise<void>}
   */
  sync () {
    this.syncing = this.syncing.then(() => this.syncNow()).catch(error => {
      this.log.error('Native controls could not update receivers:', error instanceof Error ? error.message : String(error))
    })
    return this.syncing
  }

  /**
   * A free receiver port inside the configured range, starting at `preferred`.
   * @param {number} preferred @param {string} id
   */
  async choosePort (preferred, id) {
    const { port: first, lastPort: last } = this.config
    const taken = new Set([...this.ports].filter(([other]) => other !== id).map(([, port]) => port))
    const start = preferred >= first && preferred <= last ? preferred : first
    for (let offset = 0; offset <= last - first; offset++) {
      const port = first + (start - first + offset) % (last - first + 1)
      if (taken.has(port)) continue
      if (await this.portFree(port, this.address)) return port
      if (port === preferred) this.log.warn(`Native controls port ${port} is in use (macOS AirPlay Receiver uses 7000); trying the next one`)
    }
    return null
  }

  async syncNow () {
    if (this.stopped || !this.python || !this.bridge) return
    const models = this.devices() ?? new Map()
    const selected = new Map([...models].filter(([id, model]) => !this.config.devices.length ||
      this.config.devices.includes(id) || this.config.devices.includes(model.device.name)))
    for (const [id, entry] of this.children) {
      if (!selected.has(id)) {
        this.children.delete(id)
        entry.child.kill('SIGTERM')
      }
    }
    const names = uniquePlayerNames([...selected].map(([id, model]) => [id, model.device.name]))
    for (const [id, model] of selected) {
      if (this.children.has(id) || this.stopped) continue
      const assigned = this.ports.get(id)
      const port = await this.choosePort(assigned ?? this.config.port + this.ports.size, id)
      if (this.stopped || this.children.has(id)) continue
      if (port === null) { this.log.error(`No free port for native controls between ${this.config.port} and ${this.config.lastPort}; widen the range in plugin settings`); continue }
      this.ports.set(id, port)
      const name = names.get(id) ?? model.device.name
      this.launch(id, name, port)
    }
  }

  /** @param {string} id @param {string} name @param {number} port */
  launch (id, name, port) {
    const args = [receiver, '--address', this.address,
      '--port', String(port), '--model', 'AudioAccessory5,1', '--bridge-url', this.bridgeUrl,
      '--device-id', id, '--name', name, '--channel-ports', `${this.config.port}-${this.config.lastPort}`]
    /** @type {NodeJS.ProcessEnv} */
    const env = { ...process.env, YOTO_MEDIAREMOTE_TOKEN: this.token, PYTHONUNBUFFERED: '1' }
    delete env[PIN_ENV]
    if (this.pin) env[PIN_ENV] = this.pin
    else args.push('--open-access')
    const child = this.spawn(this.python, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    this.children.set(id, { child, port })
    /** @type {string[]} */
    const recent = []
    for (const stream of [child.stdout, child.stderr]) {
      if (!stream) continue
      const lines = createInterface({ input: stream })
      lines.on('line', line => {
        const text = line.slice(0, 1000)
        recent.push(text)
        if (recent.length > RECENT_LINES) recent.shift()
        const message = `[Native Controls ${name}] ${text}`
        // receiver.py logs "LEVEL name message"
        if (/^(WARNING|ERROR|CRITICAL)\b/.test(text)) this.log.warn(message)
        else if (text.includes('ARTWORK ') || text.includes('READY ')) this.log.info(message)
        else this.log.debug(message)
      })
    }
    this.log.info(`Starting native iPhone controls for ${name} on port ${port}`)
    child.on('error', error => this.log.error(`Native controls for ${name}: ${error.message}`))
    child.once('close', (code, signal) => {
      if (this.children.get(id)?.child !== child) return
      this.children.delete(id)
      if (!this.stopped) {
        const output = code ? `. Last output:\n${recent.join('\n')}` : ''
        this.log.warn(`Native controls for ${name} exited (${signal ?? code}); retrying in 30 seconds${output}`)
        this.scheduleRetry()
      }
    })
  }

  scheduleRetry () {
    if (this.retry || this.stopped) return
    this.retry = setTimeout(() => {
      this.retry = null
      this.sync()
    }, 30000)
    this.retry.unref()
  }

  async stop () {
    this.stopped = true
    this.controller.abort()
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    await this.syncing
    const children = [...this.children.values()]
    this.children.clear()
    await Promise.all(children.map(({ child }) => new Promise(resolve => {
      const force = setTimeout(() => { child.kill('SIGKILL'); resolve(undefined) }, 5000)
      force.unref()
      child.once('close', () => { clearTimeout(force); resolve(undefined) })
      child.kill('SIGTERM')
    })))
    this.bridge?.closeAllConnections()
    if (this.bridge) await new Promise(resolve => this.bridge?.close(() => resolve(undefined)))
    this.bridge = null
  }
}
