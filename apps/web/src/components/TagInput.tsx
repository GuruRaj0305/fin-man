import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { normalizeTags, type TagSuggestions } from '@folio/shared';
import { api } from '../lib';

export function TagInput({ userId, initialTags = [] }: { userId: number; initialTags?: string[] }) {
  const id = useId(),
    listId = `${id}-tags`,
    hintId = `${id}-hint`,
    input = useRef<HTMLInputElement>(null),
    pendingCaret = useRef<number | null>(null),
    knownTags = useRef(initialTags),
    [value, setValue] = useState(initialTags.join(', ')),
    [caret, setCaret] = useState(value.length),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [debouncedRequest, setDebouncedRequest] = useState('');
  const start = value.slice(0, caret).lastIndexOf(',') + 1,
    nextComma = value.indexOf(',', caret),
    end = nextComma < 0 ? value.length : nextComma,
    query = value.slice(start, end).trim(),
    excluded = normalizeTags((value.slice(0, start) + value.slice(end)).split(','));
  const parameters = new URLSearchParams({
    search: (normalizeTags([query])[0] ?? '').toLowerCase(),
    limit: '8',
  });
  for (const tag of excluded
    .map((tag) => tag.toLowerCase())
    .sort()
    .slice(0, 12))
    parameters.append('exclude', tag);
  const request = parameters.toString();

  useEffect(() => {
    if (!open) {
      setDebouncedRequest('');
      return;
    }
    const timeout = window.setTimeout(() => setDebouncedRequest(request), 300);
    return () => window.clearTimeout(timeout);
  }, [request, open]);

  const suggestions = useQuery({
    // Changing the raw key immediately detaches and aborts an obsolete request.
    // The new request is enabled only after the debounce interval has elapsed.
    queryKey: ['tags', userId, open ? request : 'closed'],
    queryFn: ({ signal }) => api<TagSuggestions>(`/tags?${request}`, 'GET', undefined, signal),
    enabled: open && debouncedRequest === request && navigator.onLine,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const matches = suggestions.data?.data ?? [],
    savedTags = [...matches.map((match) => match.tag), ...knownTags.current],
    loading = navigator.onLine && (debouncedRequest !== request || suggestions.isFetching),
    expanded = open,
    activeId = expanded && matches[active] ? `${listId}-${active}` : undefined;

  useLayoutEffect(() => {
    if (pendingCaret.current !== null) {
      input.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  function choose(tag: string) {
    knownTags.current = normalizeTags([tag, ...knownTags.current]);
    const prefix = value.slice(0, start),
      suffix = value.slice(end),
      replacement = `${prefix}${prefix ? ' ' : ''}${tag}`,
      updated = suffix ? `${replacement}${suffix}` : `${replacement}, `,
      position = suffix ? replacement.length : updated.length;
    pendingCaret.current = position;
    setValue(updated);
    setCaret(position);
    setActive(-1);
    setOpen(false);
    input.current?.focus();
    if (updated === value) {
      input.current?.setSelectionRange(position, position);
      pendingCaret.current = null;
    }
  }

  return (
    <div
      className="field tag-input"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setActive(-1);
          setValue(normalizeTags(value.split(','), savedTags).join(', '));
        }
      }}
    >
      <label htmlFor={id}>Tags (comma separated)</label>
      <div className="tag-input-control">
        <input
          ref={input}
          id={id}
          name="tags"
          maxLength={500}
          placeholder="home, essentials"
          value={value}
          role="combobox"
          aria-autocomplete="list"
          aria-busy={open && loading}
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={activeId}
          aria-describedby={hintId}
          autoComplete="off"
          onFocus={() => {
            setCaret(input.current?.selectionStart ?? value.length);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onSelect={(event) => {
            const position = event.currentTarget.selectionStart ?? value.length;
            if (position !== caret) {
              setCaret(position);
              setActive(-1);
            }
          }}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              if (!open) {
                event.preventDefault();
                setOpen(true);
                setActive(0);
                return;
              }
              if (!matches.length) return;
              event.preventDefault();
              setOpen(true);
              setActive(
                !expanded || active < 0
                  ? event.key === 'ArrowDown'
                    ? 0
                    : matches.length - 1
                  : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
                      matches.length,
              );
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (expanded && matches[active]) choose(matches[active].tag);
              else if (query) choose(normalizeTags([query], savedTags)[0]);
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setActive(-1);
            }
          }}
        />
        {expanded && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Saved tags"
            className="searchable-select-options"
          >
            {matches.map((match, index) => (
              <li
                key={match.tag}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={active === index}
                className={active === index ? 'is-highlighted' : undefined}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(match.tag)}
              >
                <span>{match.tag}</span>
                {match.similar && <small>Similar spelling</small>}
              </li>
            ))}
            {!matches.length && (
              <li
                className="searchable-select-empty"
                role={suggestions.isError ? 'alert' : 'status'}
              >
                {!navigator.onLine
                  ? 'Connect to search saved tags.'
                  : suggestions.isError
                    ? 'Could not load saved tags. You can still type a tag.'
                    : loading
                      ? 'Searching tags…'
                      : 'No saved tags match. You can type a new tag.'}
              </li>
            )}
          </ul>
        )}
      </div>
      <small id={hintId}>Choose a saved tag or type a new one. Separate tags with commas.</small>
    </div>
  );
}
