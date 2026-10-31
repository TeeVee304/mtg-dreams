import { ui } from '@shared/text'
import { iconTypesOf, piecesOf, rulesParagraphs, type RulesPiece } from '../lib/rulesText'
import { symbolImage, typeImage } from '../lib/symbols'

/** A symbol as its card image; in braces, as text, when it has none. */
function ManaSymbol({ symbol }: { symbol: string }) {
  const src = symbolImage(symbol)
  return src ? <img className="mana-symbol" src={src} alt={`{${symbol}}`} draggable={false} /> : <span>{`{${symbol}}`}</span>
}

/** Words and symbols in a row; reminder text in italics. */
function Pieces({ pieces }: { pieces: RulesPiece[] }) {
  return pieces.map((piece, i) => {
    const shown = piece.kind === 'symbol' ? <ManaSymbol symbol={piece.value} /> : piece.value
    return piece.reminder ? <i key={i}>{shown}</i> : <span key={i}>{shown}</span>
  })
}

/** A mana cost as symbols (`{2}{W}`); its mana value on hover, when given. */
export function ManaCost({ cost, manaValue }: { cost: string; manaValue?: number }) {
  return (
    <span className="mana-cost" title={manaValue === undefined ? undefined : ui.card.dialog.manaValue(manaValue)}>
      <Pieces pieces={piecesOf(cost)} />
    </span>
  )
}

/** One line of text with its symbols drawn, such as a ruling. */
export function SymbolText({ text }: { text: string }) {
  return <Pieces pieces={piecesOf(text)} />
}

/** Rules text: a paragraph per ability, symbols drawn, reminder text in italics. */
export function RulesText({ text }: { text: string }) {
  return (
    <div className="rules-text">
      {rulesParagraphs(text).map((pieces, i) => (
        <p key={i}>
          <Pieces pieces={pieces} />
        </p>
      ))}
    </div>
  )
}

/** A type line after the icons of its card types, read from `oracle` when it is printed in another language. */
export function TypeLine({ typeLine, oracle = typeLine }: { typeLine: string; oracle?: string }) {
  return (
    <span className="type-line">
      {iconTypesOf(oracle).map((type) => (
        <span key={type} className="type-icon" style={{ maskImage: `url("${typeImage(type)}")` }} aria-hidden="true" />
      ))}
      <span>{typeLine}</span>
    </span>
  )
}
