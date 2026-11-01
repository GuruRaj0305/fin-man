const cleanTag = (tag: string) => tag.trim().replace(/\s+/g, ' ');
const tagKey = (tag: string) => cleanTag(tag).toLowerCase();

export function normalizeTags(tags: readonly string[], savedTags: readonly string[] = []) {
  const saved = new Map<string, string>();
  for (const tag of savedTags) {
    const key = tagKey(tag);
    if (key && !saved.has(key)) saved.set(key, cleanTag(tag));
  }
  const unique = new Map<string, string>();
  for (const tag of tags) {
    const key = tagKey(tag);
    if (key && !unique.has(key)) unique.set(key, saved.get(key) ?? cleanTag(tag));
  }
  return [...unique.values()];
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < right.length; j++) {
      current.push(
        Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + (left[i] === right[j] ? 0 : 1)),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function suggestTags(
  savedTags: readonly string[],
  query: string,
  excludedTags: readonly string[] = [],
  limit = 8,
) {
  const search = tagKey(query),
    excluded = new Set(excludedTags.map(tagKey)),
    tolerance = search.length >= 3 ? Math.min(3, Math.ceil(search.length / 3)) : 0;
  return normalizeTags(savedTags)
    .filter((tag) => !excluded.has(tagKey(tag)))
    .map((tag) => {
      const key = tagKey(tag);
      if (key === search) return { tag, score: 0, similar: false };
      if (key.startsWith(search)) return { tag, score: 1, similar: false };
      if (key.includes(search)) return { tag, score: 2, similar: false };
      const distance =
        tolerance && Math.abs(key.length - search.length) <= tolerance
          ? editDistance(search, key)
          : Infinity;
      return { tag, score: distance + 3, similar: true };
    })
    .filter((match) => !match.similar || match.score <= tolerance + 3)
    .sort((a, b) => a.score - b.score || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}
