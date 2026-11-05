/** Resolve a venue wall-clock time without silently guessing through a DST transition. */
export function venueTimeIso(
  date: string,
  time: string,
  timezone: string,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error('Use YYYY-MM-DD and HH:mm.');
  const nominal = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(nominal)) throw new Error('Invalid date or time.');
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const target = `${date} ${time}`,
    matches: number[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = nominal + offset * 60000;
    const parts = Object.fromEntries(
      format.formatToParts(candidate).map((p) => [p.type, p.value]),
    );
    if (
      `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` ===
      target
    )
      matches.push(candidate);
  }
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? 'This clock time occurs twice; choose a time outside the clock change.'
        : 'This date or time does not exist; choose another time.',
    );
  return new Date(matches[0]).toISOString();
}
export function venueTimeFields(
  iso: string,
  timezone: string,
): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}
