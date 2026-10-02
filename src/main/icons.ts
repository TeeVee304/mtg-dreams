import type { ThemeColor } from '@shared/themes'
import black from '../../resources/icons/B.png?asset'
import colorless from '../../resources/icons/C.png?asset'
import green from '../../resources/icons/G.png?asset'
import red from '../../resources/icons/R.png?asset'
import blue from '../../resources/icons/U.png?asset'
import white from '../../resources/icons/W.png?asset'

/** Window/taskbar icon per theme color. The installer and .exe always use `build/icon.ico` (gold). */
export const WINDOW_ICONS: Record<ThemeColor, string> = { W: white, U: blue, B: black, R: red, G: green, C: colorless }
