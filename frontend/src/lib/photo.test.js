import { describe, it, expect } from 'vitest'
import { fitWithin, PHOTO_MAX } from './photo.js'

describe('fitWithin', () => {
  it('shrinks the long side to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: PHOTO_MAX, h: 768 })
    expect(fitWithin(3024, 4032)).toEqual({ w: 768, h: PHOTO_MAX })
  })
  it('never enlarges a small photo', () => {
    expect(fitWithin(640, 480)).toEqual({ w: 640, h: 480 })
  })
})
