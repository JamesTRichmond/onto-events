# SAFETY — threat model and non-negotiables

Written **before** the social layer exists, on purpose. James's brief:
protections for women built from the ground up "like one does with
cybersecurity" — Bumble's founding lesson is that safety bolted on after
incidents costs 10x and the trust never returns. This file is the contract
future connect features are built against.

## What exists today

- **Tier containment.** Mature content is unreachable without the explicit
  21+ ack; a stored mature mode is refused on restore without the stored
  ack; mature never renders in family or everyone modes.
- **Family tier is RSVP-only.** No stranger pairing, no open-slot copy, no
  connect affordances on family cards. Connect features live in
  general/mature only (decided spec Q4).
- **No presence UI ships.** The legacy backend is not exposed through
  `BackendModules`; its incompatible schema is described below.
- **Location minimization.** Raw device coordinates and pins are used in memory
  for distance math, never persisted or sent to the event catalog. “my location”
  requests one fix at launch or on tap. Denial, timeout and unsupported positions
  do not substitute SLC. A deliberate city is remembered by ID; temporary pins
  restore the last non-pin choice on reopening. Maps open at a public selected-city
  anchor with the device dot off. Browser OpenStreetMap and native Apple Maps
  providers receive the area viewed in tile requests, plus normal network metadata.
  Map-area disclosure is separate from the local coordinate holding.
  **Weather** (2026-09-28, pb's call pending James — see DECISIONS): the one
  weather point derived from the feed's point that leaves the phone is its nearest
  0.1° grid point (`lib/weather/cell.ts`), sent to api.weather.gov; the radar
  map is centered on that grid point, so Apple Maps and the radar tile host see
  map squares around it. Pinned by `lib/weather/__tests__/nws.test.ts` and
  `app/(tabs)/__tests__/feed-screen-weather.test.tsx` (no request carries the
  position). Held in memory only; no storage key.
- **Age is a boolean.** No birthdate is ever stored on-device. The decided
  path: honest ack now → birthdate at beta (server-side) → verification
  conversation at App Store time.

## The data ledger (device storage and optional account data)

The October 12 location feature adds the v2 city preference and retains the v1 key
for migration/erasure. Public city anchors are build data, not device positions.
Named-region caches stay separate; only Utah may reuse geographically filtered
rows from the old global cache. No account/server holdings, source or schema change.
The web map tile provider receives the visible area; coordinates remain absent
from catalog requests and preference storage.


The October 10 feedback closeout adds actual stored-length checks to existing
review/report text: 1,000 / 500 characters, with the original nonblank checks
retained. Hosted title/description/instructions are also bounded to 240/4,000/500
characters. Existing oversized outer padding is trimmed without truncating actual
content or changing submission/review approval, version, ownership or timestamps.
Matching approved catalog copies are repaired narrowly; their existing update
trigger can advance catalog freshness. Other provenance remains intact.
The standalone community route requires loaded Everyone mode and unmounts on a
Family switch, retaining Family publisher discovery and private Going. No RPC grant,
reviewer privilege, public field, storage key or account holding is added.
Private arrival answers remain device-only; the correction link stays reachable
after dismissal and still requires a separate explicit support action.

The October 10 regional offline bake contains public publisher event fields only.
The internal classification rationale is stripped after rating; the resolved
rating remains. No attendee identities, account data, device coordinates, storage
key, schema or reviewer privilege are added. Two named failed public sources are
excluded from this partial local capture; synthetic fixtures never enter it.

The October 9 reported-content repair displays the existing private report's
matching approved activity/review and removes its current version through the
existing reviewer port. It adds no report field, storage key, account holding,
public identity or moderator privilege. Removal and marking a report reviewed
remain separate; server authorization and account deletion still apply.

The October 9 separate activation candidate registers six previously reviewed
public source contracts and five public venues. Its unmerged branch makes no
production write. After explicit approval and merge, the existing catalog sync
would hold only the same reviewed public event fields; no attendee identities,
account data, device coordinates, storage keys or schema are added. Private
RSVP and account deletion boundaries remain unchanged.

The October9 public-game proposal adds only public publisher/calendar fields
to the existing event path. Two venues use declared approximate city points;
no device coordinates are collected or sent. Fixtures omit attendee/organizer
metadata and public facilitator contacts. No new device key, account holding,
presence, schema or source activation is introduced.

The October 9 Vermont category/route follow-up changes only interpretation of
existing public calendar fields. It adds no device key, account holding,
attendee information or location collection. New car/sale sources remain
unactivated proposals; their fixtures omit author/contact metadata.

You cannot breach what you do not hold. The app-owned keys below are pinned by
`lib/__tests__/storage.test.ts` and `lib/__tests__/presence-invariants.test.ts`.
SDK-managed auth storage and server holdings are separate, explicit entries.

**App-owned device storage.** Keys in `lib/storage.ts` begin `onto.`.
`eraseAllOntoData()` sweeps that prefix; if enumeration fails, it falls back
to static keys only. Signed-in RSVP caches mirror cloud data, not device-only
data. SDK session keys are not covered by this sweep.

| key | holds | notes |
| --- | --- | --- |
| `onto.interests.v1` | picked categories | words, not people |
| `onto.mode.v1` | family / everyone / mature | refused on restore without the ack |
| `onto.adultConfirmed.v1` | the 21+ acknowledgement | a boolean; no birthdate, ever |
| `onto.joined.v1` | guest RSVP event IDs | local plans without an account |
| `onto.joined.user.v1.*` | per-account cached RSVP event IDs | suffix is the encoded user ID; mirrors cloud RSVPs |
| `onto.joined.pending.user.v1.*` | unsynced event IDs and join/remove intent | per-account queue, sent when RSVP sync succeeds |
| `onto.going.events.v1` | guest Going publisher snapshots, saved/unmarked times and history | no device coordinates or computed distance; includes ended plans |
| `onto.going.events.user.v1.*` | per-account Going snapshots and cancellation revisions/history import intent | owner-scoped; uses existing cloud RSVP/history ports; erased on account deletion and local erase |
| `onto.affinities.v1` | decayed category weights | 30-day half-life; a swipe-left takes a little away but never below zero |
| `onto.passed.v1` | event IDs swiped left ("not for me") on Discover cards | ids only; newest 500 kept |
| `onto.maybes.v1` | event IDs swiped right, the Maybes list | ids only; newest 500 kept; shown only while upcoming in the active mode |
| `onto.passedFromMaybes.v1` | passed ids whose toss started on Maybes | ids only; newest 500 kept; erased with the rest |
| `onto.arrivalFeedback.v1` | event IDs and easy/hard/skipped arrival answers | device-only, bounded 500; no GPS or timestamps |
| `onto.catalog.v1.*` | public catalogs partitioned by named service region | no device coordinates; erased with onto prefix |
| `onto.catalog.v1` | last public catalog response | so a cold launch is not an empty screen |
| `onto.locationChoice.v2` | non-pin `device`/`city` mode and launched city ID | validated; no coordinates; pins never persist; erased with the manifest |
| `onto.locationChoice.v1` | legacy `device` or `slc` | migrated on load; retained in the erase manifest |
| `onto.mapsApp.v1` | `system`, `google` or `waze` | which maps app Directions opens; an app name, never a place |
| `onto.feedRadius.v1` | chosen search radius in miles | a number — never a place |
| `onto.feedSort.v1` | `nearest` or `soonest` (an older `foryou` or `type` reads as `soonest`) | a sort name — never coordinates |
| `onto.ticketSellers.v1` | `on`, written only after a confirmed choice in Account | absent means ticket sellers stay hidden; erased with the rest |
| `onto.installTip.dismissed.v1` | `1` after dismissing installation guidance | device-only preference; no identity or location; erased with the rest |
| `onto.installTip.seen.v1` | `1` after showing the first-visit installation tip | prevents repeating the first-visit tip; Account guidance remains until dismissed; erased with the rest |
| `onto.firstRunLocationSeen.v1` | `1` after the first-open location prompt is answered or the sheet is closed | a boolean flag so the sheet opens once on first launch and never nags; no coordinates; erased with the rest |
| `sb-<project-ref>-auth-token` and SDK companion keys | persisted Supabase session, including access/refresh tokens and user metadata | SDK-owned; AsyncStorage on native, browser storage on web; outside the `onto.` manifest |

The account screen's erase action first requests Supabase local sign-out for
a signed-in account, then sweeps app-owned keys. Successful sign-out removes
the SDK session through Supabase, not through `eraseAllOntoData()`. If sign-out
fails, the screen warns that the session was not revoked; the prefix sweep
alone cannot promise removal of SDK credentials. Local erase does not delete
the cloud account; permanent account deletion is a separate action.
After confirmed account deletion, `eraseAccountPlanData(userId)` waits for
pending writes and removes only that account's cached Going snapshots, RSVP and pending queue
keys. An in-memory barrier rejects stale writes for that deleted owner. It preserves guest plans,
preferences, private arrival feedback, and another account's local buckets.
Deletion and native revocation use conditional session cleanup so a delayed
response cannot sign out a newly selected account.

Protected hosting, review, report and reviewer requests bind to the displayed
account. The transport verifies its captured token with Auth and pins that
token on the request, so an intervening account switch cannot transfer the
action. Unbound ports expose only approved public reviews. These guards add
no storage keys or public identity fields and do not replace server permissions.

Profile edits and cloud Going reads/writes use the same captured-owner rule.
Their database target and verified bearer remain tied to the initiating
account across an SDK session change. A private-port setup failure preserves
local plans in the existing account bucket; no key or data category is added.
Token ownership is verified through a separate client with persistence and
refresh disabled, so stale SDK verification cannot clear a new app session.
Missing-session failures retain pending Going actions for retry.

Coordinates are read in memory for distance arithmetic and are never written
to any of these keys and never transmitted; only the rounded weather grid point
leaves the phone. The fallback is a public downtown
anchor, not the person's position.

**What leaves the phone today.** Weather requests carry a 0.1° grid point,
never a position (above). Optional email-code sign-in sends account
data to Supabase. The service stores email address, account ID, the generated
profile display name, and cloud RSVP user/event IDs, status and timestamps.
These app-functionality holdings are disclosed in `app/privacy.tsx` and
`store/ios/privacy-disclosure.md`; they are not anonymous telemetry.

**Proposed additional telemetry (not implemented).** Q4:B (2026-09-14) permits
category × daypart counts. The account disclosure above must remain. The
telemetry-only sentence to review before any upload ships is:

> In addition to optional account and cloud RSVP data, onto may send batched
> activity-category tap counts by time of day; those counts contain no account
> or device identifier, location, or event ID.

This is a future payload constraint, not a claim that telemetry is already
collected or untraceable. Aggregate-only reads and transport/log metadata
handling must be verified before implementation and user-facing disclosures
change. A feature needing additional data needs a DECISIONS line first.

## Presence: future contract and legacy incompatibility

James, Q6:B, 2026-09-14. No social UI ships, but `PresenceBackend`,
`SetPresenceInput`, the Supabase presence methods and `onto.user_presence`
already exist. The legacy API/table allow public visibility and omitted
expiry, with no event or recipient IDs. They **do not satisfy** this contract.
They are not exposed through `BackendModules`; the source guards pin that
app-side dormancy, not database enforcement. The existing SQL still grants
authenticated access, so absence of a UI is not a server-side access control.
Before any presence feature ships, retire or replace those APIs and migrate
the schema/policies to enforce all of the following, with database tests:

- **Sharer-initiated.** A person shares "I'm at X" by choosing named
  recipients. There is no broadcast, and no setting that shares by default.
- **Event-scoped.** One share covers one event. It is not a location feed.
- **Expiring.** It ends when the event ends. Not a check-in, not a history.
- **No friend list, no last-seen.** Neither concept may enter the data model.
  A continuous or retrospective presence signal is the thing this forbids.

The basis is Page, Berrios, Wilkinson & Wisniewski (2022), p. 136: a
request-based sharing interaction lowers concern for people who are not
sharing simply to inform. The cost is that being asked is work (p. 131) —
accepted, because the alternative is a location feed.

## Threat model for the social epoch (build against this list)

1. **Predatory contact** — adults using the app to reach minors or to
   corner women. Mitigations owed before ANY messaging ships: family-tier
   isolation from all pairing (already law), block-before-message
   primitives, report flows with human review, no DM without mutual opt-in.
2. **Location leakage** — inferring a person's home/routine from presence.
   Owed: coarse/bucketed coordinates if presence ever leaves the device,
   time-delayed "was here" over live "is here", per-connection visibility
   levels (the brief's coworker-vs-best-friend layers).
3. **Harassment persistence** — blocked users re-appearing via new
   accounts. Owed: block survives re-registration signals; group join
   models (invite/apply/interview) as the group's choice.
4. **Fake supply** — fabricated events luring people to places. Owed:
   provenance on every card (already shipping), user-post moderation queue
   before user posts go public, organizer accountability for family-tier
   listings (Q6-B human-approval track if auto-map trust erodes).
5. **Data breach** — the "you can't breach what you don't hold" rule.
   Minimize the device holdings and optional account data listed above.
   Dormant schema is not evidence of an empty production table; verify
   holdings and retention before any social capability is exposed.

## Process rules

- Safety invariants ship as executable tests, never as intentions.
- A feature that weakens an invariant needs James's explicit decision in
  TIER_QUESTIONS/DECISIONS form, not a code review nit.
- Panic exit, first-move rules, and photo policies get designed with the
  first messaging feature, not after it.

## Complete V2 reviewed pilot (James, October 7)

Everyone hosts submit public-venue events and reviewed spin-offs. Signed-in public reviews expose score/text/opaque review ID only; author, posting time and RSVP remain private. A review can still imply participation through its text: posting is explicit, moderated and optional. Anonymous projection does not promise untraceability. Private arrival feedback stays on-device and erases with the manifest. No legal-name import, location tracking, attendee counts, pairing or presence. Family has none of these public submission affordances. Pilot state defaults off until James operates review. Hosted events are excluded from persistent catalog cache to avoid stale approval leaking offline. Server holds hosted submissions, reviewer roles, review authors and content reports; deletion cascades private records and withdraws hosted events.

Apple account deletion material: `onto.apple_provider_tokens` holds only an AES-GCM encrypted Apple refresh credential tied to the verified account UUID, with a separate server secret and account-bound authenticated encryption. Clients and guests have no table permission. The Apple account server function verifies the caller through Auth, checks the Apple subject on a signed code-exchange token, revokes before deletion, and never logs or returns credentials. Account deletion cascades this row. Provider configuration, key rotation and live revocation remain unverified deployment gates.
