import { Link } from 'expo-router';

import {
  InformationPage,
  InformationSection,
  InformationText,
} from '@/components/information-page';

export default function PrivacyScreen() {
  return (
    <InformationPage
      title="Privacy"
      intro="onto is built to help you find nearby events without turning your activity into an advertising profile.">
      <InformationSection title="Browsing without an account">
        <InformationText>
          You can discover events without creating an account. Your interests, display
          preferences, selected city and browsing mode, guest RSVPs, the events you keep as maybes or pass on, and last
          successful event catalog are stored on your device.
        </InformationText>
        <InformationText>
          If you allow location access, precise coordinates are used in memory to calculate
          distance and are not saved to your account or sent to onto.
        </InformationText>
      </InformationSection>

      <InformationSection title="Choosing a location">
        <InformationText>
          A city you choose is remembered. A pin stays in memory until you close onto.
          If your location is unavailable or unsupported, choose a place or an available city.
          Event requests use a named region, never your coordinates.
        </InformationText>
        <InformationText>
          Maps open at your selected city with the device dot off. The browser uses
          OpenStreetMap tiles; the iPhone uses Apple Maps. Map providers receive the area
          you view and normal network information, such as your IP address. Your selected
          pin is not saved or sent to the event catalog.
        </InformationText>
      </InformationSection>

      <InformationSection title="Weather">
        <InformationText>
          To show the weather where you are browsing, onto asks the National Weather Service about
          the nearest point on a fixed 0.1° map grid, a few miles across, never your position. The
          radar map loads map tiles for the area around that grid point from Apple Maps and from
          Iowa State University&apos;s Environmental Mesonet. Weather is kept in memory only.
        </InformationText>
      </InformationSection>

      <InformationSection title="Optional account data">
        <InformationText>
          If you choose email-code or enabled Apple sign-in, Supabase stores your email or relay address, account ID, and
          cloud RSVP status and timestamps so your plans can sync across devices.
        </InformationText>
        <InformationText>
          When you create an account, onto also creates a profile record with a display name
          taken from the part of your email address before the @ sign. You can choose a different display name in Account. The profile is deleted with your account.
        </InformationText>
        <InformationText>
          onto does not sell personal data, show ads, use behavioral advertising, or add
          third-party tracking SDKs.
        </InformationText>
      </InformationSection>

      <InformationSection title="Event information">
        <InformationText>
          Event listings come from trusted public event sources. The catalog contains event and
          venue information, not personal location histories.
        </InformationText>
      </InformationSection>

      <InformationSection title="Control and deletion">
        <InformationText>
          “Erase data on this iPhone” removes onto data stored on this device. Signed-in users can
          also choose “Delete account permanently” to delete their account, cloud RSVPs, and profile
          record, owned reviews, reports and hosted submissions. Approved hosted activities are withdrawn.
          Deletion removes that account&apos;s saved plans from this iPhone. Guest plans, preferences,
          private arrival feedback, and another account&apos;s plans remain until you erase local data.
        </InformationText>
      </InformationSection>

      <InformationSection title="Questions">
        <InformationText>
          Visit the <Link href="/support">Support page</Link> for help or privacy questions.
        </InformationText>
        <InformationText>Candidate updated October 7, 2026.</InformationText>
      </InformationSection>
      <InformationSection title="Optional V2 community pilot"><InformationText>When enabled, hosting and anonymous public reviews are optional. Submissions and reports are linked privately to your account for human review. Only approved content appears; attendee lists, review authors and posting times are not public. Review text can still reveal participation. Arrival feedback stays on your device. Deleting your account removes owned reviews and withdraws hosted activities. Apple sign-in can use a relay email; we do not request your legal name. The single-use Apple authorization code goes to our account server, which keeps an encrypted revocation credential so deleting your account also disconnects Apple. This credential is never public and is deleted with your account.</InformationText></InformationSection>
    </InformationPage>
  );
}
