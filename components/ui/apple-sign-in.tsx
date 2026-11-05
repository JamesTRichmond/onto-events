import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Apple from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { appleSignIn } from '@/lib/apple-sign-in';
import { useOntoBackend } from '@/lib/backend/context';
import { Muted } from './muted';
export function AppleSignIn({ repair = false }: { repair?: boolean }) {
  const { auth } = useOntoBackend();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (Platform.OS === 'ios' && auth.appleAvailable)
      Apple.isAvailableAsync()
        .then((value) => {
          if (active) setAvailable(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [auth.appleAvailable]);
  if (!available) return null;
  return (
    <>
      <Apple.AppleAuthenticationButton
        buttonType={repair ? Apple.AppleAuthenticationButtonType.CONTINUE : Apple.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={Apple.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={5}
        style={{ width: 220, height: 44 }}
        onPress={async () => {
          if (busy || auth.pendingAction) return;
          setBusy(true);
          setError('');
          try {
            await appleSignIn({
              nonce: () => Crypto.randomUUID(),
              hash: (raw) =>
                Crypto.digestStringAsync(
                  Crypto.CryptoDigestAlgorithm.SHA256,
                  raw,
                ),
              request: (nonce) =>
                Apple.signInAsync({
                  nonce,
                  requestedScopes: [Apple.AppleAuthenticationScope.EMAIL],
                }),
              verify: async (input) => {
                if (!(await auth.acceptAppleCredential(input)))
                  throw new Error('Apple sign-in could not be completed.');
              },
            });
          } catch {
            setError(
              'Apple sign-in is unavailable. You can use an email code or keep browsing.',
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {error ? <Muted>{error}</Muted> : null}
    </>
  );
}
