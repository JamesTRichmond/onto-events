import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const SURFACE = { light: '#F0F0F3', dark: '#212225' };
const SECONDARY = { light: '#60646C', dark: '#B0B4BA' };
const MAX_CONTENT_WIDTH = 800;

export function InformationPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.heading}>
            <ThemedText type="title">{title}</ThemedText>
            <ThemedText
              lightColor={SECONDARY.light}
              darkColor={SECONDARY.dark}
              style={styles.intro}>
              {intro}
            </ThemedText>
          </View>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function InformationSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <ThemedView lightColor={SURFACE.light} darkColor={SURFACE.dark} style={styles.card}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <View style={styles.sectionBody}>{children}</View>
    </ThemedView>
  );
}

export function InformationText({ children }: { children: ReactNode }) {
  return (
    <ThemedText
      lightColor={SECONDARY.light}
      darkColor={SECONDARY.dark}
      style={styles.body}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  heading: {
    gap: 8,
  },
  intro: {
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  sectionBody: {
    gap: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
});
