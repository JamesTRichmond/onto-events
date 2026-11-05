# App Store privacy disclosure — V2 candidate

Submit these answers only after the production build is verified.

## Data linked to the user

- Contact Info > Email Address
  - Purpose: App Functionality
  - Linked to identity: Yes
  - Used for tracking: No
  - Collected only when optional email-code or Apple sign-in is used; relay addresses are supported
- Identifiers > User ID
  - Purpose: App Functionality
  - Linked to identity: Yes
  - Used for tracking: No
- Contact Info > Name (profile display name)
  - Purpose: App Functionality
  - Linked to identity: Yes
  - Used for tracking: No
  - When a person creates an account, onto also creates a profile record with a
    display name taken from the part of their email address before the @ sign.
    A person may choose another display name in Account. The profile is deleted with
    the account.
- Usage Data > Product Interaction
  - Purpose: App Functionality
  - Linked to identity: Yes for cloud RSVP status and timestamps
  - Used for tracking: No

## Data not collected by onto

- Precise Location: used on device for distance calculation, not stored or sent to the event catalog
- Contacts, photos, audio, health, financial, browsing history, advertising data
- Crash analytics or third-party behavioral analytics in v1

## Tracking and advertising

- Tracking: No
- Third-party advertising: No
- Data broker sharing or sale: No

## V2 community pilot candidate — not yet enabled in production

Apple sign-in uses verified provider identity; email may be an Apple private relay address. No Apple legal name is requested. Optional public-venue hosting and spin-offs store account ID, submitted content, public venue/time and review state. Public reviews store account ID privately for abuse handling; only approved score/text and opaque content ID are published, without author/profile or posting time. Review text may still reveal participation, so posting requires explicit choice. Moderators can inspect submissions and reports. Private arrival feedback stays on-device and erases locally. Account deletion deletes owned submissions/reviews/reports and withdraws hosted activities. No public attendance or location history is collected. The V2 pilot must remain disabled until moderation and production disclosure are verified against the exact build.

Candidate Apple sign-in also sends a single-use authorization code to the account server to retain an encrypted revocation credential. It is used to disconnect Apple when the account is deleted; it is unavailable to clients and moderators, never public, and deleted with the account. Apple sign-in stays disabled until this server and its secret configuration are verified.

When reviewed hosting/reviews/reporting are enabled, include **User Content > Other User Content** for submitted descriptions, meeting instructions, review text and report reasons, linked privately to the account for functionality and safety, never tracking. An anonymous public projection does not make the privately linked submission unlinked data. Check these candidate answers against the exact enabled build before submitting them.

## Location selector and maps — October 12 source candidate

The local preference holds only device/city mode and a launched city ID; a pin
is memory-only. Catalog requests use a named region. The browser uses
OpenStreetMap tiles and native maps use Apple Maps; providers receive the
visible map area and normal network metadata. This provider disclosure must
match the published privacy policy and tested release. No new account data,
tracking SDK, source enrollment or production deployment is part of this PR.
