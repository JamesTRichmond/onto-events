# onto — App Store copy

## Naming

- App Store name: `onto: Things to do now` (Apple reported `onto` as already in use when the App Store Connect record was created on 2026-09-05, so the prepared fallback is the live name)
- Display name under the icon stays `onto` (from `app.json`)
- Bundle ID: `events.onto.app`
- Version: `1.0.0`
- Primary category: Lifestyle
- Secondary category: Travel

## Subtitle

things to do near you

## Promotional text

What's on in Salt Lake City right now, and what starts soon. Local venues first. No ads, no account needed, and your location never leaves your phone.

## Description

onto answers one question: what can I do nearby, right now?

Open it and see what's happening around you in Salt Lake City: shows, markets, talks, meetups and more, sorted by what's close and what starts soon. Local venues and community calendars come first. Browse without creating an account.

Where you look is up to you:
- On me: uses your location once, on your phone, to sort by distance. Never saved or sent.
- Map: pick a spot on the map instead of sharing where you are.
- Salt Lake City: browse the city from anywhere.

Make a plan:
- Tap Going to keep a plan until the event ends.
- Share an event or get directions.

Sign-in is optional. With an email code (no password), onto keeps your plans across devices. You can sign out, erase what's stored on your iPhone, or permanently delete your account inside the app.

Built calm, on purpose:
- No ads. Ever.
- No subscription required.
- No behavioral tracking.
- No chat, matching or groups.
- No mature or 21+ events.

If nothing's on, onto says so. It never invents events to fill the screen.

Salt Lake City is the first city. More to come.

## Keywords

events,Salt Lake City,SLC,Utah,nearby,tonight,weekend,local,concerts,markets,meetups,shows,plans

("things to do" is already in the app name, which Apple indexes; repeating it here wastes characters.)

## URLs

- Privacy: https://onto-35j.pages.dev/privacy
- Support: https://onto-35j.pages.dev/support
- Marketing: https://onto-35j.pages.dev
- Not onto.events yet: every path there is a Squarespace "Coming Soon" parking page (checked 2026-09-27). Point the store URLs at onto.events only once it serves the real site.
- Copyright: 2026 James Richmond
- Routing app coverage file: none. onto hands directions to a maps app; it is not a routing app.
- Support mail: support@onto.events forwards to James through Squarespace Domains email forwarding (runs on Mailgun). There is no hosted inbox.

## Review notes

onto provides accountless event discovery. Location permission is optional; when
denied, the app uses a public central Salt Lake City point and clearly labels the
fallback.

To test optional sign-in, enter an email address and use the six-digit code sent
by Supabase. No password is required. A signed-in user can save an RSVP, view it
under Account, sign out, erase local data, and permanently delete the account
from the same screen.

The app contains no purchases, subscriptions, ads, user-generated content,
messaging, matching, groups, or mature event controls in version 1.0.
