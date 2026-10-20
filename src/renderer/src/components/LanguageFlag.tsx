import type { ReactNode } from 'react'
import { languageLabel, type Language } from '@shared/languages'

/** Flags drawn on a 3 × 2 grid (viewBox 0 0 30 20); Windows draws no flag emoji. */
const FLAGS: Record<Language, ReactNode> = {
  de: (
    <>
      <rect width="30" height="7" fill="#000" />
      <rect y="6.67" width="30" height="6.67" fill="#dd0000" />
      <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
    </>
  ),
  fr: (
    <>
      <rect width="10" height="20" fill="#0055a4" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ef4135" />
    </>
  ),
  it: (
    <>
      <rect width="10" height="20" fill="#009246" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ce2b37" />
    </>
  ),
  es: (
    <>
      <rect width="30" height="20" fill="#aa151b" />
      <rect y="5" width="30" height="10" fill="#f1bf00" />
    </>
  ),
  pt: (
    <>
      <rect width="30" height="20" fill="#da291c" />
      <rect width="12" height="20" fill="#046a38" />
      <circle cx="12" cy="10" r="3.6" fill="#ffe900" />
    </>
  ),
  ja: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <circle cx="15" cy="10" r="6" fill="#bc002d" />
    </>
  ),
  ko: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <path d="M9.5 10a5.5 5.5 0 0 1 11 0z" fill="#cd2e3a" />
      <path d="M9.5 10a5.5 5.5 0 0 0 11 0z" fill="#0047a0" />
    </>
  ),
  ru: (
    <>
      <rect width="30" height="7" fill="#fff" />
      <rect y="6.67" width="30" height="6.67" fill="#0039a6" />
      <rect y="13.33" width="30" height="6.67" fill="#d52b1e" />
    </>
  ),
  zhs: (
    <>
      <rect width="30" height="20" fill="#de2910" />
      <path d="M6 3l1.2 3.6H11L7.9 8.8l1.2 3.6L6 10.2l-3.1 2.2 1.2-3.6L1 6.6h3.8z" fill="#ffde00" />
    </>
  ),
  zht: (
    <>
      <rect width="30" height="20" fill="#fe0000" />
      <rect width="15" height="10" fill="#000095" />
      <circle cx="7.5" cy="5" r="2.6" fill="#fff" />
    </>
  ),
  ph: (
    <>
      <rect width="30" height="20" fill="#1c1f2b" />
      <text x="15" y="15.5" textAnchor="middle" fontSize="15" fontFamily="serif" fill="#e4e1d6">
        Φ
      </text>
    </>
  )
}

/** A small flag for a copy's language, named on hover; no border, as a note beside the version. */
export function LanguageFlag({ code }: { code: Language }) {
  const label = languageLabel(code)
  return (
    <svg className="lang-flag" viewBox="0 0 30 20" width="15" height="10" role="img" aria-label={label}>
      <title>{label}</title>
      {FLAGS[code]}
    </svg>
  )
}
