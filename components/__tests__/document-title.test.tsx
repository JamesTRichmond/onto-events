import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import renderer from 'react-test-renderer';

import { DocumentTitle } from '../document-title';

describe('DocumentTitle', () => {
  it('renders nothing on native, so no Expo Head handoff alert can appear', () => {
    let tree!: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<DocumentTitle title="onto" />);
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('the root layout reaches expo-router/head only through the web variant', () => {
    const root = join(__dirname, '..', '..');
    const layout = readFileSync(join(root, 'app', '_layout.tsx'), 'utf8');
    const web = readFileSync(join(root, 'components', 'document-title.web.tsx'), 'utf8');
    const native = readFileSync(join(root, 'components', 'document-title.tsx'), 'utf8');

    expect(layout).not.toContain('expo-router/head');
    expect(layout).toContain('<DocumentTitle title="onto" />');
    expect(web).toContain("from 'expo-router/head'");
    expect(native).not.toContain('expo-router/head');
  });
});
