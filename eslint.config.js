// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}', 'lib/backend/context.tsx'],
    ignores: ['**/__tests__/**', 'app/_layout.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@supabase/*', '**/supabase-*', '**/configured-modules'],
          message: 'Use backend capability contracts/context; transport composition belongs in app/_layout.tsx.',
        }],
      }],
    },
  },
]);
