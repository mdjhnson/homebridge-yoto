import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createServer } from 'node:net'
import {
  NativeControls, PIN_ENV, getNativeControlsConfig, isPortFree, nativeControlsAddress, parseLinuxDefaultRoutes, uniquePlayerNames,
} from './native-controls.js'
/** @import { Logger } from 'homebridge' */
/** @import { YotoDeviceModel } from 'yoto-nodejs-client' */
/** @import { spawn, ChildProcess } from 'node:child_process' */
/** @import { NetworkInterfaceInfo } from 'node:os' */

/**
 * A logger that records messages by level.
 * @returns {{ log: Logger, lines: Record<string, string[]> }}
 */
function recordingLog () {
  /** @type {Record<string, string[]>} */
  const lines = { info: [], debug: [], warn: [], error: [] }
  /** @param {string} level */
  const record = level => (/** @type {unknown[]} */ ...args) => { lines[level]?.push(args.join(' ')) }
  const log = /** @type {Logger} */ (/** @type {unknown} */ ({
    info: record('info'), debug: record('debug'), warn: record('warn'), error: record('error'),
  }))
  return { log, lines }
}

/**
 * @param {string} address
 * @returns {NetworkInterfaceInfo}
 */
const ipv4 = address => /** @type {NetworkInterfaceInfo} */ ({ address, family: 'IPv4', internal: false, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: null })

/**
 * A stand-in for child_process.spawn that records launches.
 */
function fakeSpawner () {
  /** @type {Array<{ args: string[], child: EventEmitter & { stdout: PassThrough, stderr: PassThrough }, signals: string[], env: NodeJS.ProcessEnv | undefined }>} */
  const launched = []
  const fakeSpawn = (/** @type {string} */ executable, /** @type {string[]} */ args,
    /** @type {import('node:child_process').SpawnOptions} */ options) => {
    assert.equal(executable, '/fake/python')
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
    /** @type {string[]} */ const signals = []
    Object.assign(child, {
      kill (/** @type {string} */ signal) {
        signals.push(signal)
        queueMicrotask(() => child.emit('close', 0, signal))
        return true
      },
    })
    launched.push({ args, child, signals, env: options.env })
    return /** @type {ChildProcess} */ (/** @type {unknown} */ (child))
  }
  return { launched, spawn: /** @type {typeof spawn} */ (/** @type {unknown} */ (fakeSpawn)) }
}

/** @param {string} name */
const player = name => /** @type {YotoDeviceModel} */ (/** @type {unknown} */ ({ device: { name } }))

test('native controls validate config', () => {
  assert.throws(() => getNativeControlsConfig({ port: 65536 }), /port/)
  assert.throws(() => getNativeControlsConfig({ devices: [17] }), /player names/)
  assert.throws(() => getNativeControlsConfig({ pin: '12 34' }), /PIN/)
  assert.throws(() => getNativeControlsConfig({ pin: '123' }), /PIN/)
  assert.throws(() => getNativeControlsConfig({ allowAnyoneOnNetwork: 'yes' }), /Allow anyone/)
  const defaults = getNativeControlsConfig(undefined)
  assert.equal(defaults.port, 7100)
  assert.equal(defaults.pin, undefined)
  assert.equal(defaults.allowAnyoneOnNetwork, false)
  assert.equal(getNativeControlsConfig({ pin: '' }).pin, undefined)
  assert.equal(getNativeControlsConfig({ pin: ' 2468 ' }).pin, '2468')
})

test('LAN address detection ignores container bridges and checks a configured address', () => {
  const noRoutes = () => []
  const interfaces = {
    eth0: [ipv4('192.0.2.10')],
    docker0: [ipv4('172.17.0.1')],
    'br-1a2b3c': [ipv4('172.18.0.1')],
    veth12: [ipv4('169.254.1.1')],
    tailscale0: [ipv4('100.64.0.5')],
  }
  assert.equal(nativeControlsAddress(undefined, interfaces, noRoutes), '192.0.2.10')
  assert.throws(() => nativeControlsAddress('192.0.2.254', { eth0: [ipv4('192.0.2.1')] }, noRoutes), /192\.0\.2\.254 is not assigned.*eth0 192\.0\.2\.1/)
  assert.equal(nativeControlsAddress('172.17.0.1', interfaces, noRoutes), '172.17.0.1')
})

test('with Ethernet and Wi-Fi on the same network, the default-route interface wins', () => {
  const interfaces = { eth0: [ipv4('192.0.2.10')], wlan0: [ipv4('192.0.2.11')], docker0: [ipv4('172.17.0.1')] }
  assert.equal(nativeControlsAddress(undefined, interfaces, () => ['eth0', 'wlan0']), '192.0.2.10')
  assert.equal(nativeControlsAddress(undefined, interfaces, () => ['wlan0']), '192.0.2.11')
  // A default route through an ignored interface (a VPN) doesn't decide it.
  assert.equal(nativeControlsAddress(undefined, interfaces, () => ['tailscale0', 'eth0']), '192.0.2.10')
  // Without route information the user must choose, and the error lists the options.
  assert.throws(() => nativeControlsAddress(undefined, interfaces, () => []),
    /Advanced > Native iPhone Controls.*found: eth0 192\.0\.2\.10, wlan0 192\.0\.2\.11, docker0 172\.17\.0\.1/)
  assert.throws(() => nativeControlsAddress(undefined, { docker0: [ipv4('172.17.0.1')] }, () => []), /found: docker0/)
  assert.throws(() => nativeControlsAddress(undefined, {}, () => []), /found: none/)
})

test('default routes are read from /proc/net/route, lowest metric first', () => {
  const table = [
    'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
    'wlan0\t00000000\t0102000A\t0003\t0\t0\t600\t00000000\t0\t0\t0',
    'eth0\t00000000\t0102000A\t0003\t0\t0\t100\t00000000\t0\t0\t0',
    'eth0\t0002000A\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0',
    'docker0\t000011AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
    'eth1\t00000000\t0102000A\t0002\t0\t0\t50\t00000000\t0\t0\t0',
    '',
  ].join('\n')
  assert.deepEqual(parseLinuxDefaultRoutes(table), ['eth0', 'wlan0'], 'down routes (eth1) and non-default routes are skipped')
  assert.deepEqual(parseLinuxDefaultRoutes(''), [])
})

test('a failed Python setup says what to install', async () => {
  const manager = new NativeControls({}, '/fake/storage', () => new Map(), recordingLog().log, {
    prepare: async () => { throw new Error('No module named venv') },
    address: () => '192.0.2.1',
    savePin: async pin => pin,
  })
  try {
    await assert.rejects(manager.start(), /Could not set up Python.*python3-venv.*No module named venv/)
  } finally {
    await manager.stop()
  }
})

test('isPortFree reports a bound port as busy', async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  assert.equal(await isPortFree(address.port, '127.0.0.1'), false)
  await new Promise(resolve => server.close(() => resolve(undefined)))
  assert.equal(await isPortFree(address.port, '127.0.0.1'), true)
})

test('players with the same name get distinct receiver names', () => {
  const names = uniquePlayerNames([['aaaa1111', 'Yoto Mini'], ['bbbb2222', 'Yoto Mini'], ['cccc3333', 'Kitchen']])
  assert.deepEqual([...names.values()], ['Yoto Mini (1111)', 'Yoto Mini (2222)', 'Kitchen'])
})

test('managed receivers select players, skip busy ports, retry failures and close on shutdown', async () => {
  const address = '192.0.2.1'
  const { launched, spawn } = fakeSpawner()
  const models = new Map([['one', player('Bedroom')], ['two', player('Kitchen')]])
  const busy = new Set([7100])
  const { log, lines } = recordingLog()
  const manager = new NativeControls({ address, devices: ['Bedroom'], pin: '24681357' }, '/fake/storage', () => models, log, {
    prepare: async () => '/fake/python',
    address: () => address,
    spawn,
    portFree: async port => !busy.has(port),
  })
  try {
    await manager.start()
    assert.equal(launched.length, 1)
    assert.ok(launched[0]?.args.includes('one'))
    assert.ok(!launched[0]?.args.includes(manager.token))
    assert.equal(launched[0]?.env?.['YOTO_MEDIAREMOTE_TOKEN'], manager.token)
    assert.equal(launched[0]?.env?.[PIN_ENV], '24681357')
    assert.ok(!launched[0]?.args.includes('24681357'), 'the PIN must not be visible in argv')
    assert.ok(!launched[0]?.args.includes('--open-access'))
    assert.equal(manager.children.get('one')?.port, 7101, 'busy port 7100 is skipped')
    assert.ok(lines['warn']?.some(line => line.includes('7100 is in use')))
    await manager.sync()
    assert.equal(launched.length, 1)
    manager.config.devices = []
    await manager.sync()
    assert.equal(launched.length, 2)
    assert.equal(manager.children.get('two')?.port, 7102)

    // A crash is explained with the receiver's last output.
    launched[0]?.child.stderr.write('Traceback (most recent call last):\nOSError: [Errno 48] Address already in use\n')
    launched[0]?.child.stderr.write('WARNING yoto-native-controls BRIDGE unavailable\n')
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(lines['warn']?.some(line => line.includes('BRIDGE unavailable')))
    launched[0]?.child.emit('close', 1, null)
    assert.ok(manager.retry)
    assert.ok(lines['warn']?.some(line => line.includes('exited (1)') && line.includes('Address already in use')))
    await manager.sync()
    assert.equal(manager.children.get('one')?.port, 7101, 'a restarted receiver keeps its port')
    models.delete('two')
    await manager.sync()
    assert.deepEqual(launched[1]?.signals, ['SIGTERM'])
  } finally {
    await manager.stop()
  }
  assert.equal(manager.children.size, 0)
  assert.equal(manager.bridge, null)
  assert.equal(manager.retry, null)
  await manager.sync()
  assert.equal(launched.length, 3)
})

test('a missing PIN is generated and saved, and a saved PIN wins', async () => {
  const { launched, spawn } = fakeSpawner()
  const models = new Map([['one', player('Bedroom')]])
  /** @type {string[]} */
  const saved = []
  const { log, lines } = recordingLog()
  const runtime = {
    prepare: async () => '/fake/python',
    address: () => '192.0.2.1',
    spawn,
    portFree: async () => true,
  }
  const fresh = new NativeControls({}, '/fake/storage', () => models, log, {
    ...runtime, savePin: async (/** @type {string} */ pin) => { saved.push(pin); return pin },
  })
  try {
    await fresh.start()
  } finally {
    await fresh.stop()
  }
  assert.equal(saved.length, 1)
  assert.match(saved[0] ?? '', /^\d{8}$/)
  assert.equal(launched[0]?.env?.[PIN_ENV], saved[0])
  assert.ok(!lines['info']?.some(line => line.includes(saved[0] ?? 'missing')), 'the PIN is never logged')

  const restarted = new NativeControls({}, '/fake/storage', () => models, log, {
    ...runtime, savePin: async () => '13572468',
  })
  try {
    await restarted.start()
  } finally {
    await restarted.stop()
  }
  assert.equal(launched[1]?.env?.[PIN_ENV], '13572468')
})

test('open access runs receivers without a PIN', async () => {
  const { launched, spawn } = fakeSpawner()
  let saves = 0
  const { log, lines } = recordingLog()
  const manager = new NativeControls({ allowAnyoneOnNetwork: true, pin: '24681357' }, '/fake/storage',
    () => new Map([['one', player('Bedroom')]]), log, {
      prepare: async () => '/fake/python',
      address: () => '192.0.2.1',
      spawn,
      portFree: async () => true,
      savePin: async pin => { saves++; return pin },
    })
  const previous = process.env[PIN_ENV]
  process.env[PIN_ENV] = 'inherited'
  try {
    await manager.start()
  } finally {
    await manager.stop()
    if (previous === undefined) delete process.env[PIN_ENV]
    else process.env[PIN_ENV] = previous
  }
  assert.equal(saves, 0)
  assert.ok(launched[0]?.args.includes('--open-access'))
  assert.equal(launched[0]?.env?.[PIN_ENV], undefined, 'an inherited PIN is not passed on')
  assert.ok(lines['warn']?.some(line => line.includes('without a PIN')))
})
