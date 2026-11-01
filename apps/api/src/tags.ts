import { normalizeTags, suggestTags, type TagSuggestion, type tagSearchQuery } from '@folio/shared';
import type { z } from 'zod';

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const FUZZY_CANDIDATES = 128;

/** Only indexed tag rows are read here; transaction history is never loaded. */
export async function searchTags(
  db: D1Database,
  userId: number,
  query: z.infer<typeof tagSearchQuery>,
): Promise<TagSuggestion[]> {
  const search = (normalizeTags([query.search])[0] ?? '').toLowerCase(),
    excluded = normalizeTags(query.exclude).map((tag) => tag.toLowerCase()),
    where = `t.user_id=?${excluded.length ? ` AND t.tag_key NOT IN (${excluded.map(() => 'lower(?)').join(',')})` : ''}`,
    bindings = [userId, ...excluded],
    prefix = await db
      .prepare(
        `SELECT t.name FROM tags t WHERE ${where}
         ${search ? 'AND t.tag_key>=lower(?) AND t.tag_key<lower(?)' : ''}
         ORDER BY t.tag_key LIMIT ?`,
      )
      .bind(...bindings, ...(search ? [search, `${search}\u{10ffff}`] : []), query.limit)
      .all<{ name: string }>();
  let names = prefix.results.map((row) => row.name);
  if (!search || names.length === query.limit || search.length < 3)
    return names.map((tag) => ({ tag, similar: false }));

  // Scope is part of the inverted index, as well as an enforced SQL predicate.
  // FTS5's trigram tokenizer indexes substring and shared-trigram lookups.
  const scope = `scope:${quote(`workspace:${userId}:`)}`;
  async function fullText(expression: string, limit: number) {
    const rows = await db
      .prepare(
        `SELECT t.name FROM tag_search JOIN tags t ON t.id=tag_search.rowid
         WHERE tag_search MATCH ? AND ${where} ORDER BY rank LIMIT ?`,
      )
      .bind(`${scope} AND (${expression})`, ...bindings, limit)
      .all<{ name: string }>();
    return rows.results.map((row) => row.name);
  }
  names = normalizeTags([...names, ...(await fullText(`name:${quote(search)}`, query.limit))]);
  if (names.length < query.limit) {
    const grams = new Set<string>();
    for (let i = 0; i <= search.length - 3; i++) grams.add(search.slice(i, i + 3));
    const fuzzy = await fullText(
      [...grams].map((gram) => `name:${quote(gram)}`).join(' OR '),
      FUZZY_CANDIDATES,
    );
    names = normalizeTags([...names, ...fuzzy]);
  }
  return suggestTags(names, search, excluded, query.limit).map(({ tag, similar }) => ({
    tag,
    similar,
  }));
}

/** Resolve capitalization at the write boundary, even if autocomplete was skipped. */
export async function canonicalizeTags(db: D1Database, userId: number, input: string[]) {
  const tags = normalizeTags(input);
  if (!tags.length) return tags;
  const saved = await db
    .prepare(
      `SELECT name FROM tags WHERE user_id=? AND tag_key IN (${tags.map(() => 'lower(?)').join(',')})`,
    )
    .bind(userId, ...tags)
    .all<{ name: string }>();
  return normalizeTags(
    tags,
    saved.results.map((row) => row.name),
  );
}
