import { Alert, Platform } from 'react-native';

export type ConfirmRequest = {
  title: string;
  message: string;
  /** The destructive button's words, e.g. "Erase". */
  confirmLabel: string;
  onConfirm: () => unknown;
};

/**
 * Ask before a destructive action, on every platform.
 *
 * react-native-web ships Alert.alert as an empty function, so on the web app
 * (Android Chrome, iPhone Safari, desktop) a confirm built on Alert never
 * appears and the action never runs. The web build asks with the browser's
 * own confirm dialog; native keeps the platform alert with Cancel first.
 */
export function confirmThen({ title, message, confirmLabel, onConfirm }: ConfirmRequest): void {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return;
    if (window.confirm(`${title}\n\n${message}`)) void onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    // Returned as-is so callers (and tests) can await the action.
    { text: confirmLabel, style: 'destructive', onPress: onConfirm as () => void },
  ]);
}
