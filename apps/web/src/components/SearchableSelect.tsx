import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, RefreshCw } from 'lucide-react';

type Choice = { value: string; label: string };

export function SearchableSelect({
  label,
  name,
  options,
  value,
  onChange,
  required = true,
  addLabel,
  onAdd,
  refreshLabel,
  onRefresh,
  refreshing,
}: {
  label: string;
  name: string;
  options: Choice[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  addLabel: string;
  onAdd: () => void;
  refreshLabel: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const id = useId(),
    listId = `${id}-choices`,
    input = useRef<HTMLInputElement>(null),
    [query, setQuery] = useState(''),
    [open, setOpen] = useState(false),
    [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value),
    selectedValue = selected?.value ?? '',
    matches = options.filter((option) =>
      option.label.toLowerCase().includes(query.trim().toLowerCase()),
    ),
    active = Math.min(activeIndex, matches.length - 1),
    activeId = open && active >= 0 ? `${listId}-${active}` : undefined;

  useEffect(() => {
    input.current?.setCustomValidity(
      required && !selectedValue ? `Choose a ${label.toLowerCase()} from the list.` : '',
    );
  }, [label, required, selectedValue]);
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  function choose(option: Choice) {
    input.current?.focus();
    onChange(option.value);
    setQuery('');
    setOpen(false);
  }

  return (
    <div
      className="field searchable-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="searchable-select-heading">
        <label htmlFor={id}>{label}</label>
        <div className="searchable-select-actions">
          <button
            type="button"
            className="select-action-button"
            aria-label={addLabel}
            title={`${addLabel} (opens in a new tab)`}
            disabled={!navigator.onLine}
            onClick={onAdd}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <input type="hidden" name={name} value={selectedValue} />
      <div className="searchable-select-control">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          autoComplete="off"
          required={required && !selectedValue}
          placeholder={selected?.label ?? `Search ${label.toLowerCase()}`}
          value={open ? query : (selected?.label ?? query)}
          onFocus={() => {
            if (!open) {
              setOpen(true);
              if (selected) setQuery('');
              setActiveIndex(
                selected ? options.findIndex((option) => option.value === selectedValue) : 0,
              );
            }
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            onChange('');
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(
                !open
                  ? event.key === 'ArrowDown'
                    ? 0
                    : matches.length - 1
                  : Math.max(
                      0,
                      Math.min(matches.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)),
                    ),
              );
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (matches[active]) choose(matches[active]);
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {open ? (
          <button
            type="button"
            className="searchable-select-toggle searchable-select-refresh"
            aria-label={refreshLabel}
            title={refreshLabel}
            disabled={refreshing || !navigator.onLine}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              input.current?.focus();
              onRefresh();
            }}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : undefined} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="searchable-select-toggle"
            aria-label={`Show ${label.toLowerCase()} choices`}
            tabIndex={-1}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              input.current?.focus();
              setOpen(true);
            }}
          >
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="searchable-select-options">
          {matches.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === selected?.value}
              className={index === active ? 'is-highlighted' : undefined}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.value === selected?.value && <Check size={14} aria-hidden="true" />}
            </li>
          ))}
          {!matches.length && <li className="searchable-select-empty">No matches</li>}
        </ul>
      )}
    </div>
  );
}
