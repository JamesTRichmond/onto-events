# onto privacy policy

Candidate updated October 12, 2026; deployment pending.

onto helps people discover public events in supported places. The core event feed works
without an account.

## Data stored on your device

onto stores selected interests, display preferences, guest RSVPs, taste weights,
the events you swiped into Maybes or tossed on Discover, your selected city ID
and device/city browsing preference, and the last
successful public event catalog on the device. This supports
personalization, plans, and offline recovery.

When location permission is granted, precise coordinates are used in memory to
calculate distance. onto does not store or transmit a precise location history.
If location is denied, times out, unavailable or outside supported regions, the
feed waits for you to choose a location or an available city. A deliberately chosen
city is remembered; a dropped pin is kept in memory and forgotten when you close
onto. Catalog requests name a service region and never contain your coordinates.

## Choosing a location on a map

The browser map uses Leaflet and standard OpenStreetMap tiles. The iPhone map
uses Apple Maps. Both open at the selected city's public point with the device dot
off. Tile providers receive the map area you view and normal network information
(such as IP address); tile requests can reveal that area. onto does not send the
selected pin itself to its event catalog or save it in preferences. OpenStreetMap
tiles use ordinary browser caching; onto does not bulk download maps. If tiles
are unavailable, choosing a city remains usable.

## Weather

To show the weather where the feed is looking, onto sends the National Weather
Service (api.weather.gov) the nearest point on a fixed 0.1° latitude/longitude
grid — about 11 km by 8 km in Salt Lake City, the same point for everyone near
it — never the device's position or a dropped pin's exact spot. The radar map
requests map imagery from Apple Maps and radar tiles from Iowa State
University's Environmental Mesonet for the area around that grid point. Weather
answers are held in memory only and are not stored or linked to an account.

## Optional account data

If a person chooses email-code sign-in, onto uses Supabase to store:

- email address and account identifier;
- cloud RSVP status and timestamps;
- a profile record with a display name; and
- private account records needed to provide and secure the service.

When a person creates an account, onto also creates a profile record with a
display name taken from the part of their email address before the @ sign.
An optional chosen display name can be edited in Account. The profile is deleted with the
account.

Browsing does not require sign-in. Account data is not used for advertising.

## Event data and service providers

Public event and venue information is collected from trusted event sources and
stored in Supabase. Supabase provides authentication and database hosting. Expo
provides app build and delivery infrastructure. Apple distributes the iPhone app.

onto does not sell personal data, show ads, use behavioral advertising, or add
third-party tracking SDKs.

## Retention and deletion

Local data remains until the person erases it in Account, removes the app, or the
operating system clears it. Signed-in users can permanently delete their account
inside the app; this removes the account, the cloud RSVP data, and the profile
record tied to it, owned submissions, reviews, reports and encrypted Apple revocation material; hosted activities are withdrawn.
Deletion also removes that account's saved plan cache and pending plan changes
from this iPhone. It preserves guest plans, preferences, private arrival feedback,
and any other account's local plans. The separate “Erase data on this iPhone”
action removes all onto data stored on this device.

Operational service logs may be retained briefly by infrastructure providers for
security and reliability.

## Children and mature content

onto does not expose mature or 21+ events. The service is not designed to
collect information from children.

## Contact and changes

Privacy and support requests are handled through the public Support page:

https://onto-35j.pages.dev/support

Material policy changes will update this page and its effective date.

## V2 community pilot candidate — not yet enabled in production

Apple sign-in uses verified provider identity; email may be an Apple private relay address. No Apple legal name is requested. Optional public-venue hosting and spin-offs store account ID, submitted content, public venue/time and review state. Public reviews store account ID privately for abuse handling; only approved score/text and opaque content ID are published, without author/profile or posting time. Review text may still reveal participation, so posting requires explicit choice. Moderators can inspect submissions and reports. Private arrival feedback stays on-device and erases locally. Account deletion deletes owned submissions/reviews/reports and withdraws hosted activities. No public attendance or location history is collected. The V2 pilot must remain disabled until moderation and production disclosure are verified against the exact build.

Candidate Apple sign-in also sends a single-use authorization code to the account server to retain an encrypted revocation credential. It is used to disconnect Apple when the account is deleted; it is unavailable to clients and moderators, never public, and deleted with the account. Apple sign-in stays disabled until this server and its secret configuration are verified.
