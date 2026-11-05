import { render, screen } from '@testing-library/react-native';

import SupportScreen from '../support';

describe('SupportScreen', () => {
  it('describes location choices, remembered cities and unavailable location honestly', () => {
    render(<SupportScreen />);

    expect(screen.getByText(/my location uses your location once/)).toBeTruthy();
    expect(screen.getByText(/choose location lets you pick a spot on a map/)).toBeTruthy();
    expect(screen.queryByText(/Find me|Drop a pin/)).toBeNull();
    expect(screen.getByText(/change city opens the available cities/)).toBeTruthy();
    expect(screen.getByText(/Pull down on Things To Do to retry the event catalog/)).toBeTruthy();
    // The control that build 9 replaced must not be described.
    expect(screen.queryByText(/Use my location/)).toBeNull();
  });
});
