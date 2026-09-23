import neostandard, { resolveIgnoresFromGitignore } from 'neostandard'
import globals from 'globals'

export default [
  ...neostandard({
    ignores: [
      ...resolveIgnoresFromGitignore(),
    ],
  }),
  {
    files: ['homebridge-ui/public/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, homebridge: 'readonly' },
    },
  },
]
