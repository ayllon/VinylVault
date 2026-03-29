import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { buildGoogleCoverSearchUrl, getImageSrc } from './appUtils'

describe('App utilities', () => {
  it('returns an empty image source when no path is provided', () => {
    expect(getImageSrc(null)).toBe('')
  })

  it('builds an asset URL for stored covers', () => {
    expect(getImageSrc('/covers/album.jpg')).toBe('asset:///covers/album.jpg')
  })

  it('builds a Google image search URL from record data', () => {
    const url = buildGoogleCoverSearchUrl({
      artist: 'The Clash',
      title: 'London Calling',
    })

    expect(url).toBe(
      'https://www.google.com/search?tbm=isch&q=The%20Clash%20London%20Calling%20album%20cover',
    )
  })

  it('returns null when there is not enough data to search', () => {
    const url = buildGoogleCoverSearchUrl({
      artist: '   ',
      title: '',
    })

    expect(url).toBeNull()
  })
})

describe('App', () => {
  it('renders without crashing', async () => {
    render(<App />)

    expect(
      await screen.findByText('The database is empty. Import an MDB file to get started.'),
    ).toBeInTheDocument()
  })
})