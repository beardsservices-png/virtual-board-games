/**
 * Four rungs the player actually feels. Budgets are generous enough to matter
 * on a laptop and are never a hard depth, so a slow phone degrades to a
 * shallower search instead of a long freeze.
 */
export const LEVELS = [
  { id: 1, name: 'Casual',  blurb: 'Plays fast, leaves things hanging' },
  { id: 2, name: 'Steady',  blurb: 'Punishes the obvious mistakes' },
  { id: 3, name: 'Sharp',   blurb: 'Sees a few moves ahead' },
  { id: 4, name: 'Brutal',  blurb: 'Takes its time and makes it count' },
];

const CHESS = {
  1: { budgetMs: 200,  maxDepth: 2,  blunderChance: 0.34 },
  2: { budgetMs: 500,  maxDepth: 4,  blunderChance: 0.06 },
  3: { budgetMs: 1500, maxDepth: 12, blunderChance: 0 },
  4: { budgetMs: 4000, maxDepth: 20, blunderChance: 0 },
};

const CHECKERS = {
  1: { budgetMs: 200,  maxDepth: 2,  blunderChance: 0.30 },
  2: { budgetMs: 500,  maxDepth: 5,  blunderChance: 0.06 },
  3: { budgetMs: 1500, maxDepth: 11, blunderChance: 0 },
  4: { budgetMs: 4000, maxDepth: 18, blunderChance: 0 },
};

export function settingsFor(type, level) {
  const table = type === 'chess' ? CHESS : CHECKERS;
  return table[level] || table[2];
}
