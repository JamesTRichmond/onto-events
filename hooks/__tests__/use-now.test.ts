import { act, renderHook } from '@testing-library/react-native';

import { useNow } from '../use-now';

describe('useNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns wall clock from first paint on native, then updates and cleans up its interval', () => {
    let duringRender: number | null | undefined;
    const { result, unmount } = renderHook(() => {
      const value = useNow(500);
      if (duringRender === undefined) duringRender = value;
      return value;
    });

    expect(duringRender).toBe(1_000);
    expect(result.current).toBe(1_000);

    act(() => {
      jest.setSystemTime(1_500);
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe(2_000);

    unmount();
    act(() => {
      jest.setSystemTime(2_000);
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe(2_000);
    expect(jest.getTimerCount()).toBe(0);
  });
});
