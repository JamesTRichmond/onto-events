/**
 * Android lane: the same unit and screen tests, resolved the way an Android
 * build resolves them (Platform.OS === 'android', *.android.* files first).
 * The default `npm test` runs jest-expo's iOS preset, so Android-only branches
 * were never exercised. Run with `npm run test:android`.
 *
 * jest-expo/android drops the Expo babel config when the project has no
 * babel.config.js (this repo has none), so the transform is restated here
 * with the same config file the default preset uses.
 */
const path = require('path');
const base = require('./package.json').jest;

// Run the map screens as an Android build that has a Google Maps key, so the
// lane keeps exercising them. The keyless build (maps off) has its own test:
// components/ui/__tests__/android-maps-gate.test.tsx.
process.env.EXPO_PUBLIC_ANDROID_MAPS = process.env.EXPO_PUBLIC_ANDROID_MAPS ?? 'on';

module.exports = {
  ...base,
  preset: 'jest-expo/android',
  displayName: 'android',
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        caller: { name: 'metro', bundler: 'metro', platform: 'android' },
        configFile: path.join(path.dirname(require.resolve('expo/package.json')), 'internal/babel-preset.js'),
      },
    ],
  },
};
