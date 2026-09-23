# CLAUDE.md

Homebridge platform plugin (`@mdjhnson/homebridge-yoto`) that exposes Yoto players to HomeKit. It is a maintained fork of `bcomnes/homebridge-yoto`, built on `yoto-nodejs-client` (also by bcomnes, and effectively unmaintained).

Code conventions (JSDoc types, `@import`, exhaustive switches, no `any`) are in @AGENTS.md. Feature and service status is tracked in `PLAN.md`.

## Commands

```sh
npm install
npm test              # eslint + tsc + node:test with c8 coverage (run before every commit)
npx tsc               # typecheck only
npx eslint            # lint only
node --test lib/foo.test.js
```

- Plain ESM JavaScript. There is no build step, and `tsc` only type-checks.
- Node >= 22.
- Tests sit next to the source as `*.test.js` and are excluded from the package via `files` in `package.json`.

## Layout

- `index.js`: registers the `Yoto` platform.
- `lib/platform.js`: `YotoPlatform`.
  - Creates the `YotoAccount`, persists refreshed tokens and registers accessories.
  - External accessories (SmartSpeaker, TV) are published once per runtime; a handler is re-attached if the player reconnects.
  - `getCardTitle()` is a cached card-title lookup.
- **One handler class per accessory type:**
  - `lib/accessory.js`: the bridged player, with most services.
  - `lib/speaker-accessory.js`: the external SmartSpeaker. It's a legacy option under **Advanced** in settings, because the Home app can't control non-AirPlay speakers; point users to the TV accessory.
  - `lib/television-accessory.js`: the external TV. Its inputs are "now playing", then card controls, then shortcuts.
  - `lib/card-control-accessory.js`: "Play on All Yotos".
- **Config readers:**
  - `lib/card-controls.js`: card controls, plus the shared `PlayableCard` type.
  - `lib/service-config.js`: service toggles.
  - `lib/shortcuts.js`: parses device shortcuts, names the built-in ones, resolves date placeholders.
- `lib/utils/`: small pure helpers (volume maths, OAuth/PKCE, token config rewrite, listener tracking, status-scope fallback). Put new testable logic here.
- `homebridge-ui/`: the custom settings UI.
  - `server.js` runs in the Homebridge UI process and handles the OAuth start/exchange.
  - `public/client.js` and `public/index.html` run in the browser.
- **Schema:**
  - `config.schema.json` holds the settings schema and layout.
  - `config.schema.cjs` just re-exports it for typed access (`serviceSchema`).
  - A new service toggle goes in both the schema `properties` and the `layout`.

## Yoto API gotchas (verified on real players, Sept 2026)

- **Sign-in is Authorization Code + PKCE, not device code.** Yoto retired the `device_code` grant for new apps.
  - The redirect URI is `http://127.0.0.1:8787/callback`. Nothing listens there: the user pastes the resulting address back into the UI.
  - The PKCE verifier stays in `homebridge-ui/server.js`.
  - Old client ID `Y4HJ8BFq…` (upstream's app) is in `LEGACY_CLIENT_IDS` and is replaced with the default on sign-in.
- **Scopes are per app.** `OAUTH_SCOPES` in `lib/settings.js` must match the scopes enabled on the Yoto developer app (`tpc_ot5BY24FLyZoCX9MnykipB`).
  - `openid` and `profile` are not offered.
  - Adding a scope means changing both the code and the dashboard, and existing users must sign in again.
- **`GET /device-v2/:id/status` needs `family:device-status:view`,** which the dashboard does not offer.
  - The client treats that 403 as fatal and never opens MQTT.
  - `lib/utils/status-scope-fallback.js` wraps `client.getDeviceStatus` to return an empty response on that error; status still arrives via the config endpoint and MQTT.
  - Don't remove it.
- **Volume:** players take a percentage over MQTT and **floor** it to a 0–16 step. The client's `setVolume(steps)` rounds to nearest, so steps 1, 5, 9 and 13 are unreachable. Always set volume through `setDeviceVolume()` in `lib/utils/set-device-volume.js`.
- **Built-in shortcuts** live on system card `3nC80`, with chapters `daily`, `radio-day` and `radio-night`.
  - The card's title lookup returns 403, so they get fixed names.
  - Yoto Daily's track is the placeholder `<yyyymmdd>`, which must be resolved when played (`resolveShortcutKey`).
- **Newer Minis** report `deviceType: 'minie'`. The client marks them unsupported, but they behave like a Mini.
- **Shortcut changes** emit `configUpdate` with no field name in `changedFields`. Compare `getShortcutsSignature()` instead.
- **Shared device model:** several accessory handlers use one `YotoDeviceModel`. Register listeners through `ListenerGroup` and never call `removeAllListeners` on the model; that removed other handlers' `error` listeners and could crash Homebridge.
- **External accessories can't be unpublished** in Homebridge. When one goes away, log a warning instead.

## Testing

- `lib/accessories.test.js` drives the real handler classes with real HAP-NodeJS services, a stand-in `PlatformAccessory` and a fake `EventEmitter` device model. Extend it for handler behaviour, using `characteristic.handleSetRequest()` and `handleGetRequest()`.
- **Real players:** only with the user's go-ahead.
  - Sign in with the same PKCE helpers as the UI, keep tokens in the session scratchpad (never in the repo), and run Homebridge sandboxed: `node node_modules/homebridge/bin/homebridge.js -D -U <scratch dir> -P .`
  - Homebridge renames its process, so stop it by PID, not with `pkill -f`.
- **Never send commands to a real player** (play, pause, volume, sleep timer, Bluetooth, nightlight) without asking first. Children may be asleep next to it. Reads are fine once the user has agreed to testing.

## Releases

- Don't edit `CHANGELOG.md` by hand; `npm version` regenerates it with auto-changelog.
- **Publishing:** GitHub Actions → **npm bump** (`.github/workflows/release.yml`).
  - It uses npm trusted publishing (OIDC, `id-token: write`), with no npm token.
  - It runs `npm version`, pushes the tag, runs `npm publish`, and creates a GitHub release.
- The default branch is `master`.
- `PLUGIN_NAME` in `lib/settings.js` must equal the `package.json` `name`. `PLATFORM_NAME` stays `Yoto` for config compatibility.
