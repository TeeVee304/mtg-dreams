import { useState, type CSSProperties } from 'react'
import { ui } from '@shared/text'
import type { Row } from '../lib/summary'
import { fanPlace, HAND_SIZE, libraryOf, putOnBottom, shuffled, toBottom } from '../lib/startingHand'
import { Modal } from './Modal'
import { FoilSheen } from './Placeholders'

/** Props of {@link StartingHand}. */
interface StartingHandProps {
  /** The rows to draw from: the shown version's main deck, its commanders aside. */
  rows: Row[]
  onClose: () => void
}

/** A copy in the library; `id` keeps its card element as the hand fans out around it. */
interface Copy {
  id: number
  row: Row
}

/** A shuffled library, the cards in hand from its top, the mulligans taken and the cards put on the bottom since. */
interface Deal {
  library: Copy[]
  drawn: number
  mulligans: number
  bottomed: number
}

const deal = (rows: Row[], mulligans: number): Deal => ({
  library: shuffled(libraryOf(rows)).map((row, id) => ({ id, row })),
  drawn: HAND_SIZE,
  mulligans,
  bottomed: 0
})

/** Animations are off (Windows' "reduce animations"): a card goes to the bottom at once. */
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * An opening hand of seven random cards, held as a fan on a dark table, as a goldfish test:
 * Mulligan deals seven again (the first free, as in Commander), then the cards tremble until you
 * click those to put on the bottom; a hovered card comes to the front. Draw slides in the next card. The rows are
 * read when it opens; edits meanwhile don't reshuffle it.
 */
export function StartingHand({ rows, onClose }: StartingHandProps) {
  const [state, setState] = useState(() => deal(rows, 0))
  /** Deals so far: a new deal's cards are new elements, so they're dealt in again. */
  const [round, setRound] = useState(0)
  /** The card on its way to the bottom, while it slides away. */
  const [leaving, setLeaving] = useState<number | null>(null)
  const text = ui.startingHand
  const hand = state.library.slice(0, state.drawn)
  /** Cards still to put on the bottom. */
  const pending = toBottom(state.mulligans) - state.bottomed
  const redeal = (mulligans: number) => {
    setState(deal(rows, mulligans))
    setRound(round + 1)
    setLeaving(null)
  }
  const bottomCard = (index: number) => {
    setLeaving(null)
    setState({ ...state, library: putOnBottom(state.library, index), drawn: state.drawn - 1, bottomed: state.bottomed + 1 })
  }
  return (
    <Modal
      title={text.title}
      size="stage"
      onClose={onClose}
      footer={
        <>
          <span className="muted small">{text.status(state.mulligans, state.library.length - state.drawn)}</span>
          <span className="spacer" />
          <button type="button" disabled={toBottom(state.mulligans + 1) >= HAND_SIZE} onClick={() => redeal(state.mulligans + 1)}>
            {text.mulligan}
          </button>
          <button
            type="button"
            className="primary"
            disabled={pending > 0 || state.drawn >= state.library.length}
            onClick={() => setState({ ...state, drawn: state.drawn + 1 })}
          >
            {text.draw}
          </button>
        </>
      }
    >
      <div className={`starting-hand${pending > 0 ? ' bottoming' : ''}`}>
        {hand.map(({ id, row }, index) => {
          const printing = row.resolution?.printing
          const { x, y, rotate } = fanPlace(index, hand.length)
          const style = { '--x': `${x}px`, '--y': `${y}px`, '--rot': `${rotate}deg`, '--deal': index, '--z': index } as CSSProperties
          return (
            <button
              key={`${round} ${id}`}
              type="button"
              className={`hand-card${index >= HAND_SIZE - state.bottomed ? ' drawn' : ''}${leaving === id ? ' leaving' : ''}`}
              style={style}
              aria-label={pending > 0 ? text.bottomCard(row.line.name) : row.line.name}
              // Not disabled while it can't be clicked: a disabled button gets no hover, so it couldn't come to the front.
              onClick={() => pending > 0 && leaving === null && (still() ? bottomCard(index) : setLeaving(id))}
              onAnimationEnd={(event) => event.animationName === 'hand-leave' && bottomCard(index)}
            >
              {printing?.imageNormal ? (
                <img src={printing.imageNormal} alt="" draggable={false} />
              ) : (
                <span className="card-tile-name-only">{row.line.name}</span>
              )}
              {row.line.foil && <FoilSheen />}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
