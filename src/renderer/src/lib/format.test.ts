import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardCount, cleanError, formatDate, formatEur, formatIsoDate, timeAgo } from './format'

afterEach(() => vi.useRealTimers())

describe('formatting for the window', () => {
  it('writes prices as euros, and a dash when unknown', () => {
    expect(formatEur(12.5)).toMatch(/12[,.]50/)
    expect(formatEur(12.5)).toContain('€')
    expect(formatEur(null)).toBe('—')
    expect(formatEur(undefined)).toBe('—')
  })

  it('counts cards in words', () => {
    expect(cardCount(1)).toBe('1 card')
    expect(cardCount(0)).toBe('0 cards')
    expect(cardCount(60)).toBe('60 cards')
  })

  it('writes dates day first', () => {
    expect(formatDate(new Date(2026, 9, 9, 12).getTime())).toBe('09-10-2026')
    expect(formatIsoDate('2026-10-09T10:00:00Z')).toBe('09-10-2026')
    expect(formatIsoDate('soon')).toBe('soon')
  })

  it('says how long ago, in the largest unit that reads well', () => {
    vi.useFakeTimers({ now: 10 * 24 * 60 * 60_000 })
    const ago = (ms: number) => timeAgo(Date.now() - ms)
    expect(ago(10_000)).toBe('just now')
    expect(ago(5 * 60_000)).toBe('5 min ago')
    expect(ago(3 * 60 * 60_000)).toBe('3 h ago')
    expect(ago(3 * 24 * 60 * 60_000)).toBe('3 days ago')
  })

  it('strips Electron’s IPC prefix from errors', () => {
    expect(cleanError(new Error("Error invoking remote method 'list:create': Error: That name is taken."))).toBe('That name is taken.')
    expect(cleanError('plain')).toBe('plain')
  })
})
