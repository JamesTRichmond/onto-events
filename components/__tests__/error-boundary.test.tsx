import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ErrorBoundary } from '../error-boundary';

function Bomb({ exploded }: { exploded: boolean }) {
  if (exploded) throw new Error('boom');
  return <Text>alive</Text>;
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Text>alive</Text>
      </ErrorBoundary>
    );
    expect(screen.getByText('alive')).toBeTruthy();
  });

  it('contains a crash and recovers via Try again', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb exploded />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something broke.')).toBeTruthy();
    // The boundary logs the error name and message plus the component stack,
    // never the whole error object.
    const contained = spy.mock.calls.find(
      ([first]) => typeof first === 'string' && first.startsWith('Error caught in ErrorBoundary')
    );
    expect(contained?.[0]).toBe('Error caught in ErrorBoundary: Error: boom');
    expect(String(contained?.[1])).toContain('at ErrorBoundary');

    rerender(
      <ErrorBoundary>
        <Bomb exploded={false} />
      </ErrorBoundary>
    );
    fireEvent.press(screen.getByText('Try again'));
    expect(screen.getByText('alive')).toBeTruthy();
    spy.mockRestore();
  });
});
