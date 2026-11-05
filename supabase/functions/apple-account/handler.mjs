// The transport supplies verified auth and crypto ports. No body-supplied user ID is trusted.
export function appleAccountHandler(ports) {
  return async (request) => {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, apikey, x-client-info, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers });
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers });
    if (request.method !== 'POST')
      return reply(405, { error: 'POST required' });
    const token = request.headers
      .get('Authorization')
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply(401, { error: 'Authentication required' });
    try {
      const user = await ports.authenticate(token);
      if (!user) return reply(401, { error: 'Authentication required' });
      const subject = user.identities?.find(
        (identity) => identity.provider === 'apple',
      )?.identity_data?.sub;
      if (typeof subject !== 'string' || !subject)
        return reply(403, { error: 'Apple-linked account required' });
      if (Number(request.headers.get('content-length') ?? 0) > 8192)
        return reply(413, { error: 'Request too large' });
      const raw = await request.text();
      if (raw.length > 8192) return reply(413, { error: 'Request too large' });
      const body = JSON.parse(raw);
      // The expected ID is a precondition, never authority to act on that ID.
      // A switched request token must fail before provider or database writes.
      if (typeof body.expectedUserId !== 'string' || body.expectedUserId !== user.id)
        return reply(409, { error: 'Account changed. Confirm this action again.' });
      if (body.action === 'status') {
        const record = await ports.load(user.id);
        return reply(200, { ready: record != null });
      }
      if (body.action === 'register') {
        if (
          typeof body.authorizationCode !== 'string' ||
          !body.authorizationCode ||
          body.authorizationCode.length > 4096
        )
          return reply(400, { error: 'Fresh Apple authorization required' });
        const credential = await ports.exchange(body.authorizationCode);
        if (credential.subject !== subject)
          return reply(403, { error: 'Apple identity mismatch' });
        await ports.store(
          user.id,
          await ports.encrypt(credential.refreshToken, user.id),
        );
        return reply(200, { ok: true });
      }
      if (body.action === 'delete') {
        const record = await ports.load(user.id);
        if (!record)
          return reply(409, {
            error: 'Continue with Apple again, then retry deletion',
          });
        const refreshToken = await ports.decrypt(record, user.id);
        await ports.revoke(refreshToken);
        await ports.deleteUser(user.id);
        return reply(200, { deleted: true });
      }
      return reply(400, { error: 'Unknown action' });
    } catch {
      // Provider errors, tokens and request bodies must never be reflected or logged.
      return reply(503, {
        error: 'Apple account action unavailable. Please retry.',
      });
    }
  };
}
