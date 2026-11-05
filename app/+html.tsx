import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Root HTML shell for statically rendered web pages (`web.output: "static"`).
 * The document <title> comes from `DocumentTitle` (web variant) in
 * app/_layout.tsx; this file adds the meta tags the default shell lacks.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ backgroundColor: '#0B1020' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0B1020" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="onto" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta
          name="description"
          content="onto shows you things to do near you."
        />
        <meta property="og:title" content="onto" />
        <meta property="og:type" content="website" />
        <meta
          property="og:description"
          content="onto shows you things to do near you."
        />
        <meta property="og:site_name" content="onto" />
        <meta property="og:url" content="https://onto.events" />
        <meta property="og:image" content="https://onto.events/og-image.png" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html:
              'html,body,#root{background-color:#0B1020;overscroll-behavior:none}html,body{height:100%;overflow:hidden}html{height:calc(100% + var(--onto-viewport-gap,0px))}@media (prefers-color-scheme:dark){html,body,#root{background-color:#0B1020}}',
          }}
        />
        {/* Let Chrome show its own install prompt and menu item. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){window.__ontoInstallPrompt=e;});",
          }}
        /> 
      </head>
      <body style={{ backgroundColor: '#0B1020' }}>{children}</body>
    </html>
  );
}
