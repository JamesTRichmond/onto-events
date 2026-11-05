import { appleSignIn } from '../apple-sign-in';
const raw = '0123456789abcdef0123456789abcdef';
test('exchanges the token with the original nonce and sends the hashed challenge to Apple', async () => {
  const verify = jest.fn();
  const request = jest
    .fn()
    .mockResolvedValue({
      identityToken: 'signed-token',
      fullName: { familyName: 'Not imported' },
      email: 'relay@privaterelay.appleid.com',
    });
  await appleSignIn({
    nonce: () => raw,
    hash: async () => 'hash',
    request,
    verify,
  });
  expect(request).toHaveBeenCalledWith('hash');
  expect(verify).toHaveBeenCalledWith({ token: 'signed-token', nonce: raw });
});
test('cancel leaves the account unchanged', async () => {
  const verify = jest.fn();
  expect(
    await appleSignIn({
      nonce: () => raw,
      hash: async () => 'hash',
      request: async () => {
        throw { code: 'ERR_REQUEST_CANCELED' };
      },
      verify,
    }),
  ).toBe(false);
  expect(verify).not.toHaveBeenCalled();
});
test('missing identity token never reaches the backend', async () => {
  const verify = jest.fn();
  await expect(
    appleSignIn({
      nonce: () => raw,
      hash: async () => 'hash',
      request: async () => ({ identityToken: null }),
      verify,
    }),
  ).rejects.toThrow();
  expect(verify).not.toHaveBeenCalled();
});
