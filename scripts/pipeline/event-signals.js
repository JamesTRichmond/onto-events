const ONE_NIGHT = /\bone[-\s]+night[-\s]+only\b|\bone[-\s]+show[-\s]+only\b|\bfarewell\b|\bfinal\s+performance\b/i;
const oneNightPhrase = (record) => `${record.title ?? ''} ${record.description ?? ''}`.match(ONE_NIGHT)?.[0] ?? null;

function boundDescription(description, max = 8000) {
  const phrase = oneNightPhrase({ description });
  const chars = Array.from(description);
  const prefix = chars.slice(0, max).join('');
  if (!phrase || oneNightPhrase({ description: prefix })) return prefix;
  const suffix = `\n${phrase}.`;
  return chars.slice(0, max - Array.from(suffix).length).join('') + suffix;
}

module.exports = { oneNightPhrase, boundDescription };
