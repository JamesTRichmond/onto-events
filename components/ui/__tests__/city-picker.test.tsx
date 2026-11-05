import { fireEvent, render, screen } from '@testing-library/react-native';

import { CityPicker } from '@/components/ui/city-picker';
import { CITY_STATES, CITIES } from '@/data/cities';

describe('CityPicker', () => {
  const defaultProps = {
    selectedCityId: 'salt-lake-city' as const,
    onPick: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders states in strictly alphabetical order', () => {
    render(<CityPicker {...defaultProps} />);
    const stateButtons = screen.getAllByRole('button').filter(btn =>
      btn.props.testID?.startsWith('state-toggle-')
    );
    const renderedStateNames = stateButtons.map(btn =>
      btn.props.accessibilityLabel.split(',')[0].trim()
    );
    const expectedSortedStates = [...CITY_STATES].sort((a, b) => a.localeCompare(b));
    expect(renderedStateNames).toEqual(expectedSortedStates);
  });

  it('renders cities within each state in strictly alphabetical order', () => {
    render(<CityPicker {...defaultProps} selectedCityId="miami" />);
    // Florida cities should be alphabetized when Florida is expanded
    const expectedFloridaCities = CITIES
      .filter(c => c.state === 'Florida')
      .map(c => c.name)
      .sort((a, b) => a.localeCompare(b));

    expect(expectedFloridaCities).toEqual([
      'Gainesville',
      'Jacksonville',
      'Key West',
      'Miami',
      'Orlando',
      'Pensacola',
      'Tallahassee',
      'Tampa Bay',
    ]);

    const renderedFloridaCityElements = expectedFloridaCities.map(name =>
      screen.getByLabelText(name)
    );
    expect(renderedFloridaCityElements).toHaveLength(expectedFloridaCities.length);

    // Expand Vermont and check alphabetical order
    const vtHeader = screen.getByTestId('state-toggle-vermont');
    fireEvent.press(vtHeader);

    const expectedVermontCities = CITIES
      .filter(c => c.state === 'Vermont')
      .map(c => c.name)
      .sort((a, b) => a.localeCompare(b));

    expect(expectedVermontCities).toEqual([
      'Bristol',
      'Burlington',
      'Middlebury',
      'Montpelier',
      'Royalton',
      'Rutland',
      'South Burlington',
      'Vergennes',
      'White River Junction',
      'Williston',
      'Woodstock',
    ]);

    const renderedVermontCityElements = expectedVermontCities.map(name =>
      screen.getByLabelText(name)
    );
    expect(renderedVermontCityElements).toHaveLength(expectedVermontCities.length);
  });

  it('auto-expands the state of the currently selected city by default and collapses others', () => {
    render(<CityPicker {...defaultProps} selectedCityId="salt-lake-city" />);
    // Utah should be expanded
    const utahHeader = screen.getByTestId('state-toggle-utah');
    expect(utahHeader.props.accessibilityState).toEqual({ expanded: true });
    expect(utahHeader.props.accessibilityLabel).toContain('expanded');

    // California should be collapsed
    const caHeader = screen.getByTestId('state-toggle-california');
    expect(caHeader.props.accessibilityState).toEqual({ expanded: false });
    expect(caHeader.props.accessibilityLabel).toContain('collapsed');

    // Selected city indicator
    expect(screen.getByText('Selected city')).toBeTruthy();
  });

  it('toggles a state section when tapped', () => {
    render(<CityPicker {...defaultProps} selectedCityId="salt-lake-city" />);
    const flHeader = screen.getByTestId('state-toggle-florida');
    expect(flHeader.props.accessibilityState).toEqual({ expanded: false });

    // Tap to expand
    fireEvent.press(flHeader);
    expect(flHeader.props.accessibilityState).toEqual({ expanded: true });
    expect(flHeader.props.accessibilityLabel).toContain('expanded');

    // Tap to collapse
    fireEvent.press(flHeader);
    expect(flHeader.props.accessibilityState).toEqual({ expanded: false });
    expect(flHeader.props.accessibilityLabel).toContain('collapsed');
  });

  it('calls onPick when an active city is selected', () => {
    const onPick = jest.fn();
    render(<CityPicker {...defaultProps} selectedCityId="salt-lake-city" onPick={onPick} />);
    fireEvent.press(screen.getByLabelText('Salt Lake City'));
    expect(onPick).toHaveBeenCalledWith('salt-lake-city');
  });

  it('calls onPick when a city in another state is expanded and selected', () => {
    const onPick = jest.fn();
    render(<CityPicker {...defaultProps} selectedCityId="salt-lake-city" onPick={onPick} />);
    const flHeader = screen.getByTestId('state-toggle-florida');
    fireEvent.press(flHeader);
    fireEvent.press(screen.getByLabelText('Miami'));
    expect(onPick).toHaveBeenCalledWith('miami');
  });

  it('calls onClose when Cancel is pressed', () => {
    const onClose = jest.fn();
    render(<CityPicker {...defaultProps} onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('Cancel city selection'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the Coming soon heading while no city is waiting to launch', () => {
    render(<CityPicker {...defaultProps} />);
    expect(screen.queryByText('Coming soon')).toBeNull();
    expect(screen.queryByLabelText(/, Coming soon$/)).toBeNull();
  });
});
