import { useEffect, useRef, useState } from 'react';
import {
  getItem,
  setItem,
  onOntoDataErased,
  STORAGE_KEYS,
} from '@/lib/storage';
import type { ArrivalAnswer } from '@/lib/community';
export function useArrivalFeedback(eventId: string) {
  const [answers, setAnswers] = useState<Record<string, ArrivalAnswer>>({});
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const dirty = useRef<Record<string, ArrivalAnswer>>({});
  useEffect(() => {
    let active = true;
    const captured = generation.current;
    const unsubscribe = onOntoDataErased(() => {
      generation.current += 1;
      dirty.current = {};
      setAnswers({});
      setLoaded(true);
    });
    (async () => {
      const raw = await getItem(STORAGE_KEYS.arrivalFeedback);
      let valid: Record<string, ArrivalAnswer> = {};
      try {
        const parsed = JSON.parse(raw ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          valid = Object.fromEntries(
            Object.entries(parsed)
              .filter(
                ([id, answer]) =>
                  id.length > 0 &&
                  id.length <= 200 &&
                  ['easy', 'hard', 'skipped'].includes(String(answer)),
              )
              .slice(-500),
          ) as Record<string, ArrivalAnswer>;
      } catch {}
      if (active && generation.current === captured) {
        setAnswers({ ...valid, ...dirty.current });
        setLoaded(true);
      }
    })();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (loaded && Object.keys(dirty.current).length)
      void setItem(STORAGE_KEYS.arrivalFeedback, JSON.stringify(answers));
  }, [answers, loaded]);
  return {
    loaded,
    answered: answers[eventId] !== undefined,
    answer: (value: ArrivalAnswer) => {
      dirty.current[eventId] = value;
      setAnswers((previous) =>
        Object.fromEntries(
          Object.entries({ ...previous, [eventId]: value }).slice(-500),
        ),
      );
    },
  };
}
