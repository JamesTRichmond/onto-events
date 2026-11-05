const ticketmaster = require('./adapters/ticketmaster');
const { createIcsAdapter } = require('./adapters/ics');
const { createRssAdapter } = require('./adapters/rss');
const { createSquarespaceAdapter } = require('./adapters/squarespace');
const { createTribeAdapter } = require('./adapters/tribe');
const { createRhpAdapter } = require('./adapters/rhp');
const { createMiddleburyAdapter } = require('./adapters/middlebury');
const { createMyrecAdapter } = require('./adapters/myrec');
const { createScheduleAdapter } = require('./adapters/schedule');
const { createJsonLdAdapter } = require('./adapters/jsonld');
const { createFullCalendarAdapter } = require('./adapters/fullcalendar');
const { createLabeledAdapter } = require('./adapters/labeled');
const { createBiltmoreAdapter } = require('./adapters/biltmore');
const { createRevivalAdapter } = require('./adapters/revival');
const { createHigherGroundAdapter } = require('./adapters/higherground');
const { createSimcalAdapter } = require('./adapters/simcal');
const { createSocrataAdapter } = require('./adapters/socrata');
const { validateRegistries } = require('./registry-validation');
const { createSourceRegistry } = require('./source-contract');
const { withPublicDescriptions } = require('./public-description');
const feeds = require('../../data/feeds.json');
const venues = require('../../data/venues.json');

// Each calendar will register separately, even when calendars share a parser:
// source_name is the database's ownership and retirement boundary.
const errors = validateRegistries(feeds, venues);
if (errors.length) throw new Error(errors.join('; '));
// A paused feed is quarantined by hand after an upstream block or policy
// change, and stays registered so it cannot vanish silently: every run reports
// it as skipped with its recorded reason, the supply report marks the run
// incomplete, and no catalog write, retirement or fetch is attempted until the
// reason is removed from data/feeds.json.
function pauseAdapter(adapter, reason) {
  const skipped = () => ({ items: [], truncated: true, retireMissing: false, skipReason: `paused: ${reason}` });
  return { ...adapter, fetch: async () => skipped(), parseFixture: skipped };
}

function calendarAdapters(feeds, venues) {
  return feeds.map((feed) => {
    const factory = new Map([
      ['ics', createIcsAdapter],
      ['rss', createRssAdapter],
      ['squarespace', createSquarespaceAdapter],
      ['tribe', createTribeAdapter],
      ['rhp', createRhpAdapter],
      ['middlebury', createMiddleburyAdapter],
      ['myrec', createMyrecAdapter],
      ['schedule', createScheduleAdapter],
      ['jsonld', createJsonLdAdapter],
      ['fullcalendar', createFullCalendarAdapter],
      ['labeled', createLabeledAdapter],
      ['biltmore', createBiltmoreAdapter],
      ['revival', createRevivalAdapter],
      ['simcal', createSimcalAdapter],
      ['higherground', createHigherGroundAdapter],
      ['socrata', createSocrataAdapter],
    ]).get(feed.kind);
    if (!factory) throw new Error(`No adapter registered for feed kind: ${feed.kind}`);
    const created = factory(feed, venues);
    const adapter = feed.omitContactDetails ? withPublicDescriptions(created) : created;
    return feed.pausedReason ? pauseAdapter(adapter, feed.pausedReason) : adapter;
  });
}
const SOURCES = createSourceRegistry([ticketmaster, ...calendarAdapters(feeds, venues)]);

function selectSources(name, sources = SOURCES) {
  if (!name) return sources;
  const selected = sources.filter((source) => source.sourceName.toLowerCase() === name.toLowerCase());
  if (!selected.length) throw new Error(`Unknown source: ${name}`);
  return selected;
}

function parseArgs(args) {
  const options = { dryRun: false, fixture: false, source: null, fixturePath: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') options.dryRun = true;
    else if (args[i] === '--fixture') {
      options.fixture = true;
      if (args[i + 1] && !args[i + 1].startsWith('--')) options.fixturePath = args[++i];
    } else if (args[i] === '--source' && args[i + 1] && !args[i + 1].startsWith('--')) {
      options.source = args[++i];
    } else throw new Error(`Invalid argument: ${args[i]}`);
  }
  return options;
}

module.exports = { SOURCES, selectSources, parseArgs, calendarAdapters };
