import type { ColorFilter } from '../../shared/cards'
import type { ThemeColor } from '../../shared/themes'
// The app icon in each theme color (96 px, shown at up to 48).
import iconB from './assets/icons/B.png'
import iconC from './assets/icons/C.png'
import iconG from './assets/icons/G.png'
import iconR from './assets/icons/R.png'
import iconU from './assets/icons/U.png'
import iconW from './assets/icons/W.png'
// Mana symbols from Scryfall (svgs.scryfall.io/card-symbols); a few KB each, inlined by Vite.
import manaB from './assets/mana/B.svg'
import manaC from './assets/mana/C.svg'
import manaG from './assets/mana/G.svg'
import manaR from './assets/mana/R.svg'
import manaU from './assets/mana/U.svg'
import manaW from './assets/mana/W.svg'

export const THEME_ICONS: Record<ThemeColor, string> = { W: iconW, U: iconU, B: iconB, R: iconR, G: iconG, C: iconC }

export const MANA_SYMBOLS: Record<ColorFilter, string> = { W: manaW, U: manaU, B: manaB, R: manaR, G: manaG, C: manaC }
