import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

/**
 * Root crash containment: one bad card or hook must never take the whole
 * demo down in front of its first user. Styling is deliberately plain
 * (no themed components — they could be the thing that crashed).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log only what a developer needs to find the crash: the error name and
    // message plus the component stack. The whole error object is not dumped,
    // so an attached cause carrying request payloads stays out of the log.
    console.error(
      `Error caught in ErrorBoundary: ${error.name}: ${error.message}`,
      info.componentStack
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something broke.</Text>
        <Text style={styles.body}>Not your fault — the feed hit a bad state.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => this.setState({ hasError: false })}
          style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: Brand.indigo,
  },
  title: { color: '#ffffff', fontSize: 24, fontWeight: '700' },
  body: { color: '#B0B4BA', fontSize: 16, textAlign: 'center' },
  button: {
    marginTop: 12,
    backgroundColor: Brand.coral,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  buttonText: { color: Brand.indigo, fontSize: 16, fontWeight: '700' },
});
