/** Nonce and credential exchange are injectable; neither legal name nor email enters the payload. */
export async function appleSignIn(ports: {
  nonce(): string;
  hash(raw: string): Promise<string>;
  request(
    hashedNonce: string,
  ): Promise<{
    identityToken: string | null;
    authorizationCode?: string | null;
  }>;
  verify(input: {
    token: string;
    nonce: string;
    authorizationCode?: string;
  }): Promise<void>;
}): Promise<boolean> {
  const nonce = ports.nonce();
  if (nonce.length < 32) throw new Error('Invalid sign-in challenge');
  try {
    const credential = await ports.request(await ports.hash(nonce));
    if (!credential.identityToken)
      throw new Error('Apple did not return a sign-in token');
    await ports.verify({
      token: credential.identityToken,
      nonce,
      ...(credential.authorizationCode
        ? { authorizationCode: credential.authorizationCode }
        : {}),
    });
    return true;
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED')
      return false;
    throw error;
  }
}
