/**
 * Naples things with a date or a recurrence the publisher stated.
 * Checked 2026-11-14. No ticket-seller calendars. No invented times.
 */
import { Activity } from './activities';

export const LOCAL_GENERATED_AT = '2026-11-14T21:36:00.000Z';

export const LOCAL_ACTIVITIES: Activity[] = [
  {
    id: 'live-naples-third-street-market',
    sourceEventId: 'city-of-naples:third-street-south-farmers-market',
    sourceName: 'City of Naples',
    source: 'live',
    sourceUrl: 'https://www.naplesgov.com/parksrec/page/third-street-south-farmers-market-5',
    title: 'Third Street South Farmers Market',
    description:
      'Farmers market on 3rd Street South between Broad Avenue South and 13th Avenue South, plus part of 12th Avenue South. The City of Naples calendar lists it every Saturday, 7:30–11:30 a.m., through March 6, 2027. The Third Street South Association organizes it.',
    category: 'community',
    rating: 'family',
    venue: 'Third Street South',
    area: '3rd St S between Broad Ave S and 13th Ave S, Naples, FL 34102',
    locality: 'Naples',
    region: 'FL',
    countryCode: 'US',
    lat: 26.13198,
    lng: -81.801952,
    startsAtIso: '2026-11-21T12:30:00.000Z',
    endsAtIso: '2026-11-21T16:30:00.000Z',
    timezone: 'America/New_York',
    whenLabel: 'Sat, Nov 21, 7:30 AM',
    startsInMinutes: 0,
    attendees: 0,
    isCancelled: false,
    recurrence: {
      days: [6],
      startHour: 7,
      startMinute: 30,
      endHour: 11,
      endMinute: 30,
      seasonEnd: '2027-03-06',
    },
  },
  {
    id: 'live-naples-cambier-beach-church',
    sourceEventId: 'city-of-naples:celebration-church-cambier',
    sourceName: 'City of Naples',
    source: 'live',
    sourceUrl: 'https://www.naplesgov.com/parksrec/page/celebration-church-11',
    title: 'Celebration Community Beach Church',
    description:
      'Sunday service at the Cambier Park bandshell. The City of Naples calendar says Celebration Community Beach Church holds the service every week there, 9:30–10:30 a.m., through November 22, 2026.',
    category: 'community',
    rating: 'family',
    venue: 'Cambier Park Bandshell',
    area: '755 8th Ave S, Naples, FL 34102',
    locality: 'Naples',
    region: 'FL',
    countryCode: 'US',
    lat: 26.138432,
    lng: -81.79634,
    startsAtIso: '2026-11-15T14:30:00.000Z',
    endsAtIso: '2026-11-15T15:30:00.000Z',
    timezone: 'America/New_York',
    whenLabel: 'Sun, Nov 15, 9:30 AM',
    startsInMinutes: 0,
    attendees: 0,
    isCancelled: false,
    recurrence: {
      days: [0],
      startHour: 9,
      startMinute: 30,
      endHour: 10,
      endMinute: 30,
      seasonStart: '2026-11-15',
      seasonEnd: '2026-11-22',
    },
  },];
