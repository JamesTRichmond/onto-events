# iOS release checklist and review answers

## Export compliance

The app uses only encryption provided by the operating system and standard HTTPS
libraries. `usesNonExemptEncryption` is `false`.

## Content and commerce

- Free app; no in-app purchases or subscriptions
- No ads
- No user-generated content, chat, matching, or groups
- No mature or 21+ event content in v1
- Location permission is optional
- Email-code accounts are optional
- In-app account deletion is available to signed-in users

## Screenshot plan

Capture after live catalog data is present using an Apple-accepted 6.9-inch iPhone portrait size (1260 × 2736, 1290 × 2796, or 1320 × 2868). If no 6.9-inch device is available, use an accepted 6.5-inch size (1242 × 2688 or 1284 × 2778):

1. Discover — fresh Salt Lake City events
2. Search and category filters
3. Nearby sorting with truthful location status
4. RSVP saved state
5. Account — optional email-code sign-in
6. Account — plans, privacy, local erase, and permanent deletion

Also verify the smallest supported iPhone layout, dark mode, large Dynamic Type,
and VoiceOver before submission.

## Human gates

- Apple Developer membership must show Active
- App Store agreements must be accepted
- App Store name must be reserved
- Production support email must replace the temporary unavailable state
- Marketing, privacy, and support URLs must serve the current v1 build
- Final submission requires James’s explicit approval

## Public support-site deployment

After `EXPO_PUBLIC_SUPPORT_EMAIL` is set, run `npm run build`, inspect `/`,
`/privacy`, and `/support`, then deploy the verified `dist` directory with
`npm run deploy:web`. The command targets the existing Cloudflare Pages
project `onto` (served at `onto-35j.pages.dev`; `-35j` is Cloudflare's
subdomain suffix, not the project name) on its production branch `main`, and
does not change DNS. It needs the three public names in the environment:
`npx eas-cli env:pull --environment production` writes them to `.env.local`,
and `set -a; source .env.local; set +a` exports them before the build.
