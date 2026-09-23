import { configSchema } from '../config.schema.cjs'

/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'Yoto'

/**
 * This must match the name of your plugin as defined the package.json `name` property
 */
export const PLUGIN_NAME = '@mdjhnson/homebridge-yoto'

/**
 * Default OAuth Client ID from config schema
 */
export const DEFAULT_CLIENT_ID = configSchema.schema.properties.clientId.default

/**
 * OAuth redirect URI registered on the Yoto developer app. Nothing listens here:
 * the user copies the resulting address back into the plugin settings.
 */
export const OAUTH_REDIRECT_URI = 'http://127.0.0.1:8787/callback'

/**
 * Client IDs from earlier versions that only support the retired device-code
 * sign-in. Configs still using them are switched to DEFAULT_CLIENT_ID on sign-in.
 */
export const LEGACY_CLIENT_IDS = ['Y4HJ8BFqRQ24GQoLzgOzZ2KSqWmFG8LI']

/**
 * OAuth scopes requested during sign-in. The Yoto developer app must have the
 * same scopes enabled in the dashboard.
 * @see https://yoto.dev/authentication/scopes/
 */
export const OAUTH_SCOPES = [
  'offline_access', // refresh tokens
  'family:devices:view', // list players and read status
  'family:devices:manage', // nightlight, volume limits, Bluetooth settings
  'family:devices:control', // MQTT playback and volume control
  'family:library:view', // card titles for shortcut names
  'user:content:view', // titles of Make Your Own cards
].join(' ')

/** Device defaults */
export const DEFAULT_MANUFACTURER = 'Yoto Inc.'
export const DEFAULT_MODEL = 'Yoto Player'

/** Battery threshold */
export const LOW_BATTERY_THRESHOLD = 20

/** Logging prefixes for debugging */
export const LOG_PREFIX = {
  PLATFORM: '[Platform]',
  ACCESSORY: '[Accessory]',
  MQTT: '[MQTT]',
}
