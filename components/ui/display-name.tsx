import { useEffect, useState, useRef } from 'react';
import { TextInput } from 'react-native';
import { useOntoBackend } from '@/lib/backend/context';
import { ActionButton } from './action-button';
import { Muted } from './muted';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
export function DisplayName() {
  const { profileBackend, auth } = useOntoBackend();
  const owner = auth.state.kind === 'signed-in' ? auth.state.user.id : null;
  return profileBackend && owner ? <Picker key={owner} /> : null;
}
function Picker() {
  const { profileBackend } = useOntoBackend();
  const [name, setName] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const edited = useRef(false);
  const color = Colors[useColorScheme() ?? 'light'].text;
  useEffect(() => {
    let active = true;
    profileBackend
      ?.getMyProfile()
      .then((profile) => {
        if (active && !edited.current) setName(profile?.displayName ?? '');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [profileBackend]);
  return (
    <>
      <Muted>
        Your name or alias is optional. We do not ask for a surname or import
        your Apple name.
      </Muted>
      <TextInput
        accessibilityLabel="Name or alias"
        value={name}
        onChangeText={(value) => { edited.current = true; setName(value); }}
        maxLength={60}
        style={{ color, padding: 12 }}
      />
      <ActionButton
        label="Save name or alias"
        quiet
        busy={busy}
        disabled={!name.trim()}
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await profileBackend!.updateMyProfile({ displayName: name.trim() });
            setMessage('Name saved. Your attendance stays private.');
          } catch {
            setMessage('Could not save your name. Try again later.');
          } finally {
            setBusy(false);
          }
        }}
      />
      {message ? <Muted>{message}</Muted> : null}
    </>
  );
}
