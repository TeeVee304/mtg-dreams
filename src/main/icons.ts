import type { ThemeColor } from '../shared/themes'
import black from '../../resources/icons/B.png?asset'
import colorless from '../../resources/icons/C.png?asset'
import green from '../../resources/icons/G.png?asset'
import red from '../../resources/icons/R.png?asset'
import blue from '../../resources/icons/U.png?asset'
import white from '../../resources/icons/W.png?asset'

/**
 * The window (taskbar) icon for each color theme. The installer and the .exe keep
 * build/icon.ico (the gold one): Windows reads those from the file itself.
 */
export const WINDOW_ICONS: Record<ThemeColor, string> = { W: white, U: blue, B: black, R: red, G: green, C: colorless }
