import Head from 'expo-router/head';

/** Web only: sets the browser document title. See document-title.tsx. */
export function DocumentTitle({ title }: { title: string }) {
  return (
    <Head>
      <title>{title}</title>
    </Head>
  );
}
