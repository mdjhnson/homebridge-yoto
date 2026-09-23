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
