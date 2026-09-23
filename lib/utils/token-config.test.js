import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTokenUpdate } from './token-config.js'

const baseUpdate = {
  platform: 'Yoto',
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  tokenExpiresAt: 1700000000000,
}

test('updates tokens in the matching platform block', () => {
  const config = JSON.stringify({
    bridge: { name: 'Homebridge' },
    platforms: [
      { platform: 'Other', accessToken: 'old-access' },
      { platform: 'Yoto', accessToken: 'old-access', refreshToken: 'old-refresh', services: { battery: true } },
    ],
  })

  const result = applyTokenUpdate(config, { ...baseUpdate, prevAccessToken: 'old-access', prevRefreshToken: 'old-refresh' })
  assert.ok(result)
  const parsed = JSON.parse(result)
  assert.equal(parsed.platforms[0].accessToken, 'old-access', 'other platforms untouched')
  assert.deepEqual(parsed.platforms[1], {
    platform: 'Yoto',
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
    tokenExpiresAt: 1700000000000,
    services: { battery: true },
  })
})

test('falls back to the single Yoto block when no previous tokens are given', () => {
  const config = JSON.stringify({ platforms: [{ platform: 'Yoto', accessToken: 'old-access' }] })
  const result = applyTokenUpdate(config, baseUpdate)
  assert.ok(result)
  assert.equal(JSON.parse(result).platforms[0].accessToken, 'new-access')
})

test('leaves tokens alone when they were replaced by a new sign-in', () => {
  const config = JSON.stringify({ platforms: [{ platform: 'Yoto', accessToken: 'edited-by-ui', refreshToken: 'ui-refresh' }] })
  const result = applyTokenUpdate(config, { ...baseUpdate, prevAccessToken: 'stale', prevRefreshToken: 'stale-refresh' })
  assert.equal(result, null)
})

test('does not restore tokens after a logout', () => {
  const config = JSON.stringify({ platforms: [{ platform: 'Yoto', services: { battery: true } }] })
  const result = applyTokenUpdate(config, { ...baseUpdate, prevAccessToken: 'old-access', prevRefreshToken: 'old-refresh' })
  assert.equal(result, null)
})

test('picks the block holding the previous refresh token when several exist', () => {
  const config = JSON.stringify({
    platforms: [
      { platform: 'Yoto', refreshToken: 'a' },
      { platform: 'Yoto', refreshToken: 'b' },
    ],
  })
  const result = applyTokenUpdate(config, { ...baseUpdate, prevRefreshToken: 'b' })
  assert.ok(result)
  const parsed = JSON.parse(result)
  assert.equal(parsed.platforms[0].refreshToken, 'a')
  assert.equal(parsed.platforms[1].refreshToken, 'new-refresh')
})

test('returns null when no block can be identified', () => {
  assert.equal(applyTokenUpdate('not json', baseUpdate), null)
  assert.equal(applyTokenUpdate(JSON.stringify({}), baseUpdate), null)
  assert.equal(applyTokenUpdate(JSON.stringify({ platforms: [{ platform: 'Other' }] }), baseUpdate), null)
  const ambiguous = JSON.stringify({ platforms: [{ platform: 'Yoto' }, { platform: 'Yoto' }] })
  assert.equal(applyTokenUpdate(ambiguous, baseUpdate), null)
})

test('writes 4-space indented JSON', () => {
  const result = applyTokenUpdate(JSON.stringify({ platforms: [{ platform: 'Yoto' }] }), baseUpdate)
  assert.ok(result?.includes('\n    "platforms"'))
})
