import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyNativeControlsPin, generatePin, isValidPin } from './native-controls-pin.js'

test('generated PINs are 8 digits and valid', () => {
  for (let i = 0; i < 20; i++) {
    const pin = generatePin()
    assert.match(pin, /^\d{8}$/)
    assert.ok(isValidPin(pin))
  }
  assert.ok(!isValidPin('12 34'))
  assert.ok(!isValidPin('123'))
  assert.ok(!isValidPin(1234))
})

test('a generated PIN is saved into the platform block', () => {
  const config = { bridge: {}, platforms: [{ platform: 'Other' }, { platform: 'Yoto', services: { nativeControls: true } }] }
  const result = applyNativeControlsPin(JSON.stringify(config), { platform: 'Yoto', pin: '24681357' })
  assert.ok(result)
  assert.equal(result.pin, '24681357')
  const saved = JSON.parse(result.contents)
  assert.deepEqual(saved.platforms[1].nativeControls, { pin: '24681357' })
  assert.deepEqual(saved.platforms[0], { platform: 'Other' })
})

test('a PIN already saved is kept, and other settings survive', () => {
  const contents = JSON.stringify({ platforms: [{ platform: 'Yoto', nativeControls: { pin: '13572468', port: 7200 } }] })
  assert.deepEqual(applyNativeControlsPin(contents, { platform: 'Yoto', pin: '24681357' }), { contents, pin: '13572468' })
  const blank = JSON.stringify({ platforms: [{ platform: 'Yoto', nativeControls: { pin: '', port: 7200 } }] })
  const result = applyNativeControlsPin(blank, { platform: 'Yoto', pin: '24681357' })
  assert.deepEqual(JSON.parse(result?.contents ?? '{}').platforms[0].nativeControls, { pin: '24681357', port: 7200 })
})

test('the block is picked by child bridge username, and nothing is written when it is unclear', () => {
  const config = {
    platforms: [
      { platform: 'Yoto', _bridge: { username: 'AA:AA' } },
      { platform: 'Yoto', _bridge: { username: 'BB:BB' } },
    ],
  }
  const contents = JSON.stringify(config)
  assert.equal(applyNativeControlsPin(contents, { platform: 'Yoto', pin: '24681357' }), null)
  const result = applyNativeControlsPin(contents, { platform: 'Yoto', bridgeUsername: 'BB:BB', pin: '24681357' })
  const saved = JSON.parse(result?.contents ?? '{}')
  assert.equal(saved.platforms[0].nativeControls, undefined)
  assert.equal(saved.platforms[1].nativeControls.pin, '24681357')
  assert.equal(applyNativeControlsPin('not json', { platform: 'Yoto', pin: '24681357' }), null)
})
