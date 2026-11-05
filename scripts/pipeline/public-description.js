// Source-specific opt-in public facts. Classification and access checks run
// on the complete source first. Public event identity stays in the title;
// private contact boilerplate and publisher marketing prose are not copied.
function withPublicDescriptions(adapter) {
  return { ...adapter, normalize: (event, context) => {
    const record = adapter.normalize(event, context);
    return record ? { ...record, description: `${record.title} at ${record.venue}. See the publisher’s event page for admission, registration and access details.` } : null;
  } };
}

module.exports = { withPublicDescriptions };
