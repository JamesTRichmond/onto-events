/**
 * Android lane for the web app: the exported PWA in real Chromium, emulating
 * Android phones (Chrome UA, viewport, DPR, touch), driven with real touch
 * input through the DevTools protocol.
 *
 *   npm run build                 # export dist/ (once per change)
 *   npm run test:android:web      # serves dist/ and runs this file
 *
 * ONTO_BASE_URL=http://host:port skips the local server. First run on a new
 * machine: npx playwright install chromium
 *
 * Hermetic: nothing leaves for a third-party host. api.weather.gov gets a
 * canned NWS answer (a blocked or flaky NWS made Chromium log "Failed to load
 * resource" and failed the no-console-error checks); any other outside host
 * gets an empty 204 and is named in the boot check, so a new live call shows
 * up as a failure here instead of as a flake.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { chromium, devices } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Asheville is dense in the bundled catalog, so the feed has cards offline.
const HERE = { latitude: 35.5956, longitude: -82.5486 };
// Small, common, and large Android screens.
const PHONES = ['Galaxy S8', 'Pixel 7', 'Galaxy S9+'];

let base = process.env.ONTO_BASE_URL;
let server;
let browser;

async function waitForServer(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server at ${url} did not start`);
}

before(async () => {
  if (!base) {
    assert.ok(existsSync(path.join(ROOT, 'dist/index.html')), 'run `npm run build` first: dist/ is missing');
    const port = 8700 + Math.floor(Math.random() * 200);
    server = spawn('npx', ['expo', 'serve', '--port', String(port)], { cwd: ROOT, stdio: 'ignore' });
    base = `http://localhost:${port}`;
    await waitForServer(base);
  }
  // Lets Chrome fire beforeinstallprompt without the usual engagement wait.
  browser = await chromium.launch({ args: ['--bypass-app-banner-engagement-checks'] });
});

after(async () => {
  await browser?.close();
  server?.kill();
});

const NWS = 'https://api.weather.gov/';

/** The four NWS answers lib/weather/nws.ts asks for, stamped with the current time. */
function nwsAnswer(url) {
  const now = Date.now();
  const hour = 60 * 60_000;
  if (/\/points\//.test(url)) {
    return {
      properties: {
        forecastHourly: `${NWS}gridpoints/GSP/56,64/forecast/hourly`,
        observationStations: `${NWS}gridpoints/GSP/56,64/stations`,
        relativeLocation: { properties: { city: 'Asheville', state: 'NC' } },
      },
    };
  }
  if (/\/stations(\?|$)/.test(url)) return { features: [{ properties: { stationIdentifier: 'KAVL' } }] };
  if (/\/observations\/latest/.test(url)) {
    return {
      properties: {
        timestamp: new Date(now - 10 * 60_000).toISOString(),
        textDescription: 'Clear',
        temperature: { value: 17, unitCode: 'wmoUnit:degC' },
        windSpeed: { value: 8, unitCode: 'wmoUnit:km_h-1' },
        windDirection: { value: 200, unitCode: 'wmoUnit:degree_(angle)' },
        relativeHumidity: { value: 55, unitCode: 'wmoUnit:percent' },
      },
    };
  }
  if (/\/forecast\/hourly/.test(url)) {
    const top = Math.floor(now / hour) * hour;
    return {
      properties: {
        periods: Array.from({ length: 8 }, (_, i) => ({
          startTime: new Date(top + i * hour).toISOString(),
          temperature: 63 - i,
          temperatureUnit: 'F',
          shortForecast: 'Clear',
          probabilityOfPrecipitation: { value: 0 },
          isDaytime: true,
        })),
      },
    };
  }
  return null;
}

/** Keeps the lane off the network: onto's own origin passes, NWS is canned, the rest is emptied. */
async function hermetic(context, outside) {
  const origin = new URL(base).origin;
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || !/^https?:/.test(url)) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (url.startsWith(NWS)) {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const answer = nwsAnswer(url);
      if (answer) {
        return route.fulfill({ status: 200, contentType: 'application/geo+json', headers: cors, body: JSON.stringify(answer) });
      }
    }
    outside.push(new URL(url).host);
    return route.fulfill({ status: 204, headers: cors });
  });
}

async function openApp(phone, { geolocation = true, route = '/' } = {}) {
  const context = await browser.newContext({
    ...devices[phone],
    ...(geolocation ? { geolocation: HERE, permissions: ['geolocation'] } : {}),
  });
  const outside = [];
  await hermetic(context, outside);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  await page.goto(base + route, { waitUntil: 'networkidle' });
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, problems, outside };
}

/** Opens feed options and picks a radius wide enough to fill the feed. */
async function widenFeed(page) {
  await page.getByTestId('feed-controls').waitFor();
  await page.getByRole('button', { name: '25 miles' }).click();
  await page.getByTestId('dash-toggle').click();
  await page.getByTestId('swipe-card').nth(5).waitFor({ timeout: 15_000 });
}

/** A finger drag, as Android sends it: touchStart, moves, touchEnd. */
async function drag(cdp, from, to, steps = 14) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    const point = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const feedScrollTop = (page) =>
  page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('*')].filter(
      (el) => el.scrollHeight > el.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(el).overflowY),
    );
    return Math.max(0, ...scrollers.map((el) => el.scrollTop));
  });

/** A card whose middle sits well inside the screen, clear of the tab bar. */
async function cardInView(page) {
  const viewport = page.viewportSize();
  for (const card of await page.getByTestId('swipe-card').all()) {
    const box = await card.boundingBox();
    if (!box) continue;
    const mid = box.y + box.height / 2;
    if (mid > viewport.height * 0.3 && mid < viewport.height * 0.7) return { card, box };
  }
  throw new Error('no swipe card in the middle of the screen');
}

for (const phone of PHONES) {
  describe(`Android Chrome · ${phone}`, () => {
    it('boots to a feed of cards with no errors, and nothing wider than the screen', async () => {
      const { context, page, problems, outside } = await openApp(phone);
      await widenFeed(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `page is ${overflow}px wider than the screen`);
      assert.deepEqual(problems, []);
      assert.deepEqual([...new Set(outside)], [], 'boot reached a third-party host the lane does not stub');
      await context.close();
    });

    it('scrolls the feed when the drag starts on a card', async () => {
      const { context, page, cdp } = await openApp(phone);
      await widenFeed(page);
      const { box } = await cardInView(page);
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const before = await feedScrollTop(page);
      await drag(cdp, start, { x: start.x, y: start.y - 250 });
      await page.waitForTimeout(500);
      const moved = (await feedScrollTop(page)) - before;
      assert.ok(moved > 100, `feed moved ${moved}px for a 250px drag that started on a card`);
      await context.close();
    });

    it('still sorts a card with a sideways swipe', async () => {
      const { context, page, cdp } = await openApp(phone);
      await widenFeed(page);
      const { box } = await cardInView(page);
      const y = box.y + box.height / 2;
      await drag(cdp, { x: box.x + box.width * 0.75, y }, { x: box.x + box.width * 0.75 - 200, y });
      const snackbar = page.getByTestId('undo-snackbar');
      await snackbar.waitFor({ timeout: 5_000 });
      assert.match(await snackbar.innerText(), /Tossed/);
      await context.close();
    });

    it('Back closes event details and keeps onto open', async () => {
      // An installed app starts with one history entry, so Back used to quit.
      const { context, page } = await openApp(phone, { route: '/?source=pwa' });
      await page.getByTestId('activity-card').first().waitFor();
      await page.getByTestId('activity-card').first().click();
      await page.getByTestId('activity-details').waitFor();
      await page.evaluate(() => setTimeout(() => history.back(), 0));
      await page.getByTestId('activity-details').waitFor({ state: 'detached', timeout: 5_000 });
      assert.ok(page.url().startsWith(base), `Back left onto for ${page.url()}`);
      assert.equal(await page.getByTestId('dashboard').count(), 1);

      // Closing with the button leaves history as it was.
      const length = await page.evaluate(() => history.length);
      await page.getByTestId('activity-card').first().click();
      await page.getByTestId('activity-details').waitFor();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByTestId('activity-details').waitFor({ state: 'detached' });
      await page.waitForTimeout(300);
      assert.equal(page.url(), base + '/?source=pwa');
      assert.ok((await page.evaluate(() => history.length)) <= length + 1);
      await context.close();
    });
  });
}

describe('Android Chrome · Account (Pixel 7)', () => {
  it('says device, not iPhone, and Erase asks before it acts', async () => {
    const { context, page } = await openApp('Pixel 7', { route: '/account' });
    const body = await page.locator('body').innerText();
    assert.doesNotMatch(body, /iPhone/);
    assert.match(body, /Phone default/);
    const dialogs = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.getByText('Erase data on this device').click();
    await page.waitForTimeout(300);
    assert.equal(dialogs.length, 1, 'Erase showed no confirmation');
    assert.match(dialogs[0], /Erase local data\?/);
    await context.close();
  });

  it('offers Chrome install prompt behind onto own button', async () => {
    const { context, page } = await openApp('Pixel 7', { route: '/account' });
    // Hand the page a prompt the way Chrome does, so the test does not depend
    // on Chrome's install heuristics.
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = () => {
        window.__promptShown = true;
        return Promise.resolve();
      };
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    });
    await page.getByLabel('Install onto').click();
    assert.equal(await page.evaluate(() => window.__promptShown), true);
    await context.close();
  });
});

describe('Android Chrome · install and offline (Pixel 7)', () => {
  it('meets Chrome install requirements', async () => {
    const { context, page, cdp } = await openApp('Pixel 7');
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(installabilityErrors, []);
    const manifest = await (await fetch(`${base}/manifest.json`)).json();
    assert.equal(manifest.display, 'standalone');
    const sizes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
    for (const need of ['192x192:any', '512x512:any', '512x512:maskable']) assert.ok(sizes.includes(need), need);
    await context.close();
  });

  it('a service worker takes over, so a second visit opens offline', async () => {
    const { context, page } = await openApp('Pixel 7');
    await page.evaluate(() => navigator.serviceWorker?.ready);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), true);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('dashboard').waitFor({ timeout: 10_000 });
    await context.close();
  });

  it('without location permission: says so, and a city pick fills the feed (Back closes the picker)', async () => {
    const { context, page } = await openApp('Pixel 7', { geolocation: false });
    await page.getByRole('button', { name: 'Allow', exact: true }).click();
    await page.getByText('Your location is unavailable. Choose location or change city.').waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: 'change city' }).click();
    await page.getByTestId('city-picker').waitFor();
    await page.evaluate(() => setTimeout(() => history.back(), 0));
    await page.getByTestId('city-picker').waitFor({ state: 'detached', timeout: 5_000 });
    assert.ok(page.url().startsWith(base), 'Back left onto from the city picker');
    await page.getByRole('button', { name: 'change city' }).click();
    await page.getByRole('button', { name: 'Asheville', exact: true }).click();
    await page.getByTestId('activity-card').first().waitFor({ timeout: 15_000 });
    await context.close();
  });
});
