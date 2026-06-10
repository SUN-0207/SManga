import { useEffect, useState } from 'react';

/**
 * Returns a value that only updates after the input has been stable for
 * `delayMs`. Typing fast → previous timer cleared → only the last value
 * sticks. Used by the search modal so we don't fire a network request on
 * every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
