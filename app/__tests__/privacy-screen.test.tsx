import { render, screen } from '@testing-library/react-native';

import PrivacyScreen from '../privacy';

describe('PrivacyScreen', () => {
  it('discloses the automatic profile record and the account data it stores', () => {
    render(<PrivacyScreen />);

    expect(
      screen.getByText(
        /onto also creates a profile record with a display name taken from the part of your email address before the @ sign/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/choose a different display name in Account/i)).toBeTruthy();
    expect(screen.getByText(/The profile is deleted with your account/i)).toBeTruthy();
    expect(
      screen.getByText(/email or relay address, account ID, and cloud RSVP status and timestamps/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/delete their account, cloud RSVPs, and profile record/i),
    ).toBeTruthy();
  });
});
