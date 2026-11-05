// Keep explicit cancellation notices aligned with lib/event-availability.ts.
function isCancelledTitle(title) {
  return /^\s*(?:[*[(]+\s*)?(?:(?:cancelled|canceled)\b|no\s+(?:class|service|meeting)\b)/i.test(title)
    || /\b(?:event|class|service|meeting)\s+(?:is\s+)?(?:cancelled|canceled)\b/i.test(title);
}
/** A public calendar can also contain private invitations and room bookings. */
function isRestrictedListing(title, description) {
  // Do not decode unrelated entities: broken descriptions must not prevent
  // otherwise valid venue resolution or abort the source.
  const words = String(description ?? '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160|#xA0);/gi, ' ');
  const restrictedAccess = /\b(?:invitation[- ]only|members[- ]only|staff[- ]only|not open to (?:the )?public|closed to (?:the )?public)\b/i;
  // A direct invitation to members and their own guests does not establish
  // unrestricted public admission. A discount or a community membership
  // mention alone is not such an invitation.
  const membersInvitation = /\b(?:welcomes?|open\s+to|limited\s+to|restricted\s+to)\s+(?:[\w'-]+\s+){0,4}members\s+(?:and|&)\s+their\s+guests\b/i;
  // A calendar's footer advertising "Book a private party" is not a claim
  // that this particular listing is private. Require a direct declaration.
  return /\bprivate (?:party|event|meeting)\b/i.test(title)
    || restrictedAccess.test(title) || restrictedAccess.test(words)
    || membersInvitation.test(title) || membersInvitation.test(words)
    || /(?:^|[.!?\n])\s*(?:(?:(?:this|the) (?:event|party|meeting)|it) (?:is|will be) (?:a )?)?private (?:party|event|meeting)\b/i.test(words)
    || /\b(?:this|the) (?:event|party|meeting) (?:is|will be) private\b/i.test(words)
    || /\b(?:hall|room|chapel|kitchen)\b\s*(?:[:—-]\s*)?rental\b/i.test(title);
}

module.exports = { isCancelledTitle, isRestrictedListing };
