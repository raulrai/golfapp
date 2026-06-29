'use client'
import { useState } from 'react'
import { MOMENT_TAGS, isStoryTag, STORY_TAG } from '@/lib/golf/moments'
import type { GamePlayer } from '@/lib/golf/game'
import type { PlayerId } from '@/lib/golf/types'

/* Capture a tagged moment for the current hole — players, a tag, and an
   optional note (a multi-line box for the Story tag). */
export default function MomentSheet({ players, hole, onClose, onSave }: {
  players: GamePlayer[]
  hole: number
  onClose: () => void
  onSave: (who: PlayerId[], tag: string, note: string) => void
}) {
  const [who, setWho] = useState<PlayerId[]>([])
  const [tag, setTag] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const story = tag ? isStoryTag(tag) : false

  const toggle = (id: PlayerId) =>
    setWho((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  // Story moments are about the day, so players are optional; quick tags want a who.
  const canSave = !!tag && (story ? note.trim().length > 0 : who.length > 0)

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <h2>Moment · Hole {hole}</h2>

        <div className="tag-grid">
          {MOMENT_TAGS.map((mt) => (
            <button key={mt.tag} className={tag === mt.tag ? 'on' : ''} onClick={() => setTag(mt.tag)}>
              <span className="em">{mt.emoji}</span>
              {mt.tag}
            </button>
          ))}
        </div>

        <div className="moment-who">
          {players.map((p) => (
            <button key={p.id} className={who.includes(p.id) ? 'on' : ''} onClick={() => toggle(p.id)}>
              {p.name.split(' ')[0]}
            </button>
          ))}
        </div>

        {story ? (
          <textarea
            className="moment-note"
            placeholder="The story so far — what happened, who did what, the bit you'll want to read back."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
        ) : (
          <input
            className="moment-note"
            placeholder="Optional: the moment in one line…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}

        <button
          className="primary"
          disabled={!canSave}
          onClick={() => { if (tag) onSave(who, tag, note.trim()) }}
        >
          {story ? `Save ${STORY_TAG} note` : 'Save moment'}
        </button>
        <button className="flat" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
