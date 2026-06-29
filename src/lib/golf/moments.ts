// The one-tap diary tags for a round. Pure data — no React, no DB — so the
// Play screen and History share one source of truth. "Story" is the special
// one: it opens a multi-line box for a longer note (the others take an
// optional one-liner).

export interface MomentTag {
  tag: string
  emoji: string
  /** the Story tag opens a big multi-line box for a longer diary entry */
  story?: boolean
}

export const STORY_TAG = 'Story'

export const MOMENT_TAGS: MomentTag[] = [
  { tag: 'Monster Drive', emoji: '🚀' },
  { tag: 'Pure Class', emoji: '✨' },
  { tag: 'Up & Down', emoji: '⛳️' },
  { tag: 'Missed Putt', emoji: '😩' },
  { tag: '3 Putt', emoji: '😖' },
  { tag: 'Monster Putt', emoji: '🐍' },
  { tag: 'Clutch Putt', emoji: '🎯' },
  { tag: 'Sand Save', emoji: '🏖️' },
  { tag: 'Trash Talk', emoji: '🗣️' },
  { tag: STORY_TAG, emoji: '📖', story: true },
]

export const emojiForTag = (tag: string): string =>
  MOMENT_TAGS.find((t) => t.tag === tag)?.emoji ?? '⭐'

export const isStoryTag = (tag: string): boolean =>
  MOMENT_TAGS.find((t) => t.tag === tag)?.story ?? false
