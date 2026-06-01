import { useCallback, useRef, useState } from 'react';

export interface Participant {
  id: string;
  name: string;
}

export interface MentionState {
  suggestions: Participant[];
  query: string;
  selectedIndex: number;
  onSelect: (name: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  clear: () => void;
  detect: (val: string, selStart: number) => void;
  active: boolean;
}

/**
 * Detects `@word` in textarea and suggests matching thread participants.
 * Returns helpers to wire into the textarea's onChange / onKeyDown.
 *
 * Usage:
 *   const { suggestions, active, onSelect, onKeyDown, clear, detect } = useMentionAutocomplete(participants, value, setValue);
 */
export function useMentionAutocomplete(
  participants: Participant[],
  value: string,
  setValue: (v: string) => void,
): MentionState {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Derive suggestions from query (top 5, case-insensitive prefix match, deduped)
  const seen = new Set<string>();
  const suggestions: Participant[] = [];
  if (query.length > 0) {
    for (const p of participants) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (p.name.toLowerCase().startsWith(query.toLowerCase())) {
        suggestions.push(p);
        if (suggestions.length >= 5) break;
      }
    }
  }

  // Called on every textarea onChange to detect @word pattern at caret
  const detect = useCallback(
    (val: string, selStart: number) => {
      const before = val.slice(0, selStart);
      const match = before.match(/@(\w*)$/);
      if (match) {
        setQuery(match[1] ?? '');
        setSelectedIndex(0);
      } else {
        setQuery('');
      }
    },
    [],
  );

  const onSelect = useCallback(
    (name: string) => {
      // Replace the trailing @partial with @name + space
      const updated = value.replace(/@(\w*)$/, `@${name} `);
      setValue(updated);
      setQuery('');
      setSelectedIndex(0);
    },
    [value, setValue],
  );

  const clear = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
  }, []);

  // Returns true if event was consumed (caller should preventDefault + stopPropagation)
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (suggestions.length === 0) return false;
      if (e.key === 'ArrowDown') {
        setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
        return true;
      }
      if (e.key === 'ArrowUp') {
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        onSelect(suggestions[selectedIndex]?.name ?? '');
        return true;
      }
      if (e.key === 'Escape') {
        clear();
        return true;
      }
      return false;
    },
    [suggestions, selectedIndex, onSelect, clear],
  );

  // textareaRef is unused at runtime but kept for future focus management
  void textareaRef;

  return { suggestions, query, selectedIndex, onSelect, onKeyDown, clear, detect, active: suggestions.length > 0 && query.length > 0 };
}
