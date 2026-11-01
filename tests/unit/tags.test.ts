import { describe, expect, it } from 'vitest';
import { normalizeTags, suggestTags } from '../../packages/shared/src/tags';

describe('reusing saved transaction tags', () => {
  it('reuses saved spelling and removes case and whitespace duplicates', () => {
    expect(
      normalizeTags(
        [' bangalore ', 'BANGALORE', ' home   repairs ', '', 'Travel', 'travel'],
        ['Bangalore', 'Home repairs'],
      ),
    ).toEqual(['Bangalore', 'Home repairs', 'Travel']);
  });

  it('suggests Bangalore when the user types bangaluru', () => {
    expect(suggestTags(['Bangalore', 'Food', 'BANGALORE'], 'bangaluru')).toEqual([
      expect.objectContaining({ tag: 'Bangalore', similar: true }),
    ]);
  });

  it('prioritizes exact and partial matches and excludes tags already entered', () => {
    const saved = ['Travel', 'Home repairs', 'Home', 'Homework', 'Rome'];
    expect(suggestTags(saved, 'home').map((match) => match.tag)).toEqual([
      'Home',
      'Home repairs',
      'Homework',
      'Rome',
    ]);
    expect(
      suggestTags(saved, 'home', [' HOME ', 'home repairs']).map((match) => match.tag),
    ).toEqual(['Homework', 'Rome']);
    expect(suggestTags(saved, 'zz')).toEqual([]);
  });

  it('keeps deliberately new spellings until the user chooses a suggestion', () => {
    expect(normalizeTags(['bangaluru', 'Home'], ['Bangalore', 'home'])).toEqual([
      'bangaluru',
      'home',
    ]);
    expect(suggestTags(['home', 'HOME', 'travel'], '', ['HOME']).map((match) => match.tag)).toEqual(
      ['travel'],
    );
  });
});
