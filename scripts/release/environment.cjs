'use strict';

// Build-time checks only. Never import this file into the mobile/web bundle.
// This gate checks configuration shape, not credential validity, SMTP delivery,
// database authorization or Apple approval. Those need separate release tests.
const { isIP } = require('node:net');

const URL_KEY = 'EXPO_PUBLIC_SUPABASE_URL';
const API_KEY = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const EMAIL_KEY = 'EXPO_PUBLIC_SUPPORT_EMAIL';
const MATURE_KEY = 'EXPO_PUBLIC_ENABLE_MATURE';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function jwtPayload(value) {
  // Decode only to classify an accidental server credential. This is NOT
  // signature verification and must never be used to authorize a request.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : null;
  } catch {
    return null;
  }
}

function isPublicApiKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  return jwtPayload(value)?.role === 'anon';
}

function isPrivilegedKey(value) {
  return value.startsWith('sb_secret_') || jwtPayload(value)?.role === 'service_role';
}

// DNS host grammar, not a lookup: each label is 1-63 ASCII letters/digits or
// interior hyphens. URL parsing alone also accepts empty/invalid DNS labels.
function isDnsHostname(host) {
  const labels = host.split('.');
  return host.length <= 253 && labels.length >= 2
    && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function isHttpsOrigin(value) {
  // WHATWG URL parsing silently repairs tabs, newlines and backslashes.
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    // Non-public namespaces, not a complete list of every special-use name.
    // example.com fixtures remain valid shapes; this never claims DNS resolves.
    const nonPublic = ['localhost', 'local', 'invalid', 'test', 'example', 'home.arpa', 'onion', 'alt'];
    return url.protocol === 'https:'
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/' && !url.port
      && !isIP(host) && isDnsHostname(host)
      && !nonPublic.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function isMailbox(value) {
  // Deliberately accept a conservative ASCII subset, not every RFC mailbox.
  // The support screen constructs mailto: directly: no URI delimiters, percent
  // escapes, quoted names, controls, or Unicode may cross this boundary.
  // RFC 6068 requires encoding those characters; we reject them instead.
  const parts = value.split('@');
  if (parts.length !== 2 || value.length > 254) return false;
  const [local, domain] = parts;
  return local.length <= 64
    && /^[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*$/.test(local)
    && isDnsHostname(domain) && /^[A-Za-z]{2,}$/.test(domain.split('.').pop());
}

function inspectReleaseEnvironment(env = {}) {
  const issues = [];
  const url = text(env[URL_KEY]);
  const key = text(env[API_KEY]);
  const email = text(env[EMAIL_KEY]);

  if (!url) {
    issues.push(`${URL_KEY} is required for a production build.`);
  } else if (!isHttpsOrigin(url)) {
    issues.push(`${URL_KEY} must be a public HTTPS origin without credentials, path, query, fragment or port.`);
  }

  if (!key) {
    issues.push(`${API_KEY} is required for a production build.`);
  } else if (!isPublicApiKey(key)) {
    issues.push(`${API_KEY} must be a publishable key or legacy anon key, never a server or user-session key.`);
  }

  if (!email) {
    issues.push(`${EMAIL_KEY} is required for a production build.`);
  } else if (!isMailbox(email)) {
    issues.push(`${EMAIL_KEY} must contain one plain support email address.`);
  }

  // The app's unset default is off. Production EAS explicitly pins 'false'.
  // Never silently correct an explicitly incompatible release setting.
  if (env[MATURE_KEY] !== undefined && env[MATURE_KEY] !== 'false') {
    issues.push(`${MATURE_KEY} must be unset or exactly false for v1.`);
  }

  // The client shows Apple sign-in only when this is exactly "true"
  // (hooks/use-auth.ts). Web deploy already refuses an unset value.
  // EAS and other release builds go through app.config.js and this gate,
  // which previously ignored the flag and shipped the button hidden.
  const APPLE_KEY = 'EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN';
  const apple = text(env[APPLE_KEY]);
  if (isReleaseBuild(env) && apple !== 'true' && apple !== 'false') {
    issues.push(`${APPLE_KEY} must be set explicitly to true or false for a production build. Unset, the build silently removes Apple sign-in.`);
  }

  const unsafePublicVariable = Object.entries(env).some(([name, value]) => {
    if (!name.startsWith('EXPO_PUBLIC_') || !text(value)) return false;
    const unsafeName = /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|ACCESS_TOKEN|TM_KEY|TICKETMASTER.*KEY|EXPO_TOKEN/i.test(name);
    return unsafeName || isPrivilegedKey(text(value));
  });
  if (unsafePublicVariable) {
    // Do not print arbitrary names or values: even a key name is untrusted.
    issues.push('Remove privileged credentials from EXPO_PUBLIC_* variables before building.');
  }

  return issues;
}

function assertReleaseEnvironment(env = {}) {
  const issues = inspectReleaseEnvironment(env);
  if (issues.length) {
    // Static diagnostics only. No cause, env object or input values on errors.
    const error = new Error(`onto production build blocked:\n- ${issues.join('\n- ')}\nEnter settings in the build environment, not in chat.`);
    error.name = 'ReleaseEnvironmentError';
    throw error;
  }
}

function isReleaseBuild(env = {}) {
  return env.ONTO_RELEASE_BUILD === '1' || env.EAS_BUILD_PROFILE === 'production';
}

module.exports = { inspectReleaseEnvironment, assertReleaseEnvironment, isReleaseBuild };
