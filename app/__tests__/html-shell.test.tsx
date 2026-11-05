import renderer from 'react-test-renderer';

import Root from '../+html';

function collectStyleHtml(node: renderer.ReactTestRendererJSON | null): string {
  const chunks: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'style' && n.props?.dangerouslySetInnerHTML?.__html) {
      chunks.push(n.props.dangerouslySetInnerHTML.__html);
    }
    (n.children ?? []).forEach(walk);
  };
  walk(node);
  return chunks.join('\n');
}

describe('static HTML shell', () => {
  it('paints html, body and #root #0B1020 in light and dark (no white flash)', () => {
    let tree!: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<Root>{null}</Root>);
    });
    const css = collectStyleHtml(tree.toJSON() as renderer.ReactTestRendererJSON);

    expect(css).toContain('prefers-color-scheme:dark');
    expect(css).toContain('html,body,#root{background-color:#0B1020');
    expect(css).not.toMatch(/#fff\b|#151718/i);
  });

  it('adds the home-screen viewport gap to the page height, defaulting to 0', () => {
    let tree!: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<Root>{null}</Root>);
    });
    const css = collectStyleHtml(tree.toJSON() as renderer.ReactTestRendererJSON);

    expect(css).toContain('html{height:calc(100% + var(--onto-viewport-gap,0px))}');
    // Added once, on html only: body and #root inherit it through height:100%.
    expect(css.match(/var\(--onto-viewport-gap/g)).toHaveLength(1);
  });
});
