import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import {
  importPKCS8,
  SignJWT,
  jwtVerify,
  createRemoteJWKSet,
} from 'npm:jose@6.1.3';
import { appleAccountHandler } from './handler.mjs';

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error('Missing server configuration');
  return value;
};
const client = createClient(
  required('SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const clientId = required('APPLE_CLIENT_ID');
const keys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const encryptionKey = async () => {
  const raw = bytes(required('APPLE_TOKEN_ENCRYPTION_KEY'));
  if (raw.length !== 32) throw new Error('Invalid encryption configuration');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
};
const secret = async () =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: required('APPLE_KEY_ID') })
    .setIssuer(required('APPLE_TEAM_ID'))
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(
      await importPKCS8(
        required('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
        'ES256',
      ),
    );
const applePost = async (path: string, values: Record<string, string>) => {
  const response = await fetch(`https://appleid.apple.com/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await secret(),
      ...values,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Provider request failed');
  return response;
};
Deno.serve(
  appleAccountHandler({
    authenticate: async (token: string) => {
      const { data, error } = await client.auth.getUser(token);
      if (error) return null;
      return data.user;
    },
    exchange: async (code: string) => {
      const data = await (
        await applePost('token', { code, grant_type: 'authorization_code' })
      ).json();
      if (
        typeof data.refresh_token !== 'string' ||
        !data.refresh_token ||
        typeof data.id_token !== 'string'
      )
        throw new Error('Invalid provider response');
      const { payload } = await jwtVerify(data.id_token, keys, {
        issuer: 'https://appleid.apple.com',
        audience: clientId,
        algorithms: ['RS256'],
      });
      if (!payload.sub) throw new Error('Missing Apple subject');
      return { subject: payload.sub, refreshToken: data.refresh_token };
    },
    encrypt: async (token: string, userId: string) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: new TextEncoder().encode(userId),
        },
        await encryptionKey(),
        new TextEncoder().encode(token),
      );
      return { iv: b64(iv), cipher: b64(new Uint8Array(cipher)) };
    },
    decrypt: async (record: { iv: string; cipher: string }, userId: string) =>
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: bytes(record.iv),
            additionalData: new TextEncoder().encode(userId),
          },
          await encryptionKey(),
          bytes(record.cipher),
        ),
      ),
    store: async (userId: string, encrypted: unknown) => {
      const { error } = await client
        .schema('onto')
        .from('apple_provider_tokens')
        .upsert({
          user_id: userId,
          encrypted_token: encrypted,
          updated_at: new Date().toISOString(),
        });
      if (error) throw new Error('Credential storage unavailable');
    },
    load: async (userId: string) => {
      const { data, error } = await client
        .schema('onto')
        .from('apple_provider_tokens')
        .select('encrypted_token')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error('Credential storage unavailable');
      return data?.encrypted_token ?? null;
    },
    revoke: async (refreshToken: string) => {
      await applePost('revoke', {
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });
    },
    deleteUser: async (userId: string) => {
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw new Error('Account deletion unconfirmed');
    },
  }),
);
