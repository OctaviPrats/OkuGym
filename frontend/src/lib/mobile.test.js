import { describe, it, expect } from 'vitest'
import { resolveMobileBackAction } from './mobile.js'

describe('resolveMobileBackAction', () => {
  it('closes the top sheet first when one is open', () => {
    expect(resolveMobileBackAction({ sheets: [{ id: 'a' }, { id: 'b' }] })).toEqual({ type: 'close-sheet', id: 'b' })
  })

  it('consumes back on a locked top sheet', () => {
    expect(resolveMobileBackAction({ sheets: [{ id: 'a', locked: true }] })).toEqual({ type: 'handled' })
  })

  it('navigates back when the app can go back and no sheet is open', () => {
    expect(resolveMobileBackAction({ canGoBack: true })).toEqual({ type: 'navigate-back' })
  })

  it('navigates home before exit when authed and not on home', () => {
    expect(resolveMobileBackAction({ authed: true, pathname: '/stats' })).toEqual({ type: 'navigate-home' })
  })

  it('exits at the root when nothing else can handle back', () => {
    expect(resolveMobileBackAction({ authed: true, pathname: '/home' })).toEqual({ type: 'exit' })
  })
})
