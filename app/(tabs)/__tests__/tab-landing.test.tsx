import { TabRouter } from '@react-navigation/routers';

import { unstable_settings } from '../_layout';

describe('tab landing', () => {
  const routeNames = ['index', 'places', 'account'];
  const routerOptions = {
    routeNames,
    routeParamList: {},
    routeGetIdList: {},
  };

  it('starts a fresh tab state on Discover but preserves a restored Places focus', () => {
    const router = TabRouter({ initialRouteName: unstable_settings.initialRouteName });
    const initialState = router.getInitialState(routerOptions);

    expect(initialState.routes[initialState.index].name).toBe('index');

    const restoredState = router.getRehydratedState(
      { index: 0, routes: [{ name: 'places' }] },
      routerOptions,
    );
    expect(restoredState.routes[restoredState.index].name).toBe('places');
  });
});
