import { describe, expect, it } from 'vitest'
import { importCoverFromUrl, searchCoverCandidates, type CoverSearchQuery } from './coverLookup'
import { invokeMock } from './test/mocks/tauri'

describe('coverLookup', () => {
  it('delegates cover searches to the Tauri backend', async () => {
    const query: CoverSearchQuery = {
      artist: 'Bowie',
      country: 'UK',
      format: 'LP',
      title: 'Heroes',
      year: '1977',
    }
    const candidates = [
      {
        artist: 'David Bowie',
        country: 'UK',
        date: '1977-10-14',
        format: 'LP',
        image_url: 'https://example.com/image.jpg',
        release_group_id: 'rg-1',
        release_id: 'release-1',
        score: 100,
        source_url: 'https://musicbrainz.org/release/release-1',
        thumbnail_url: 'https://example.com/thumb.jpg',
        title: 'Heroes',
      },
    ]

    invokeMock.mockResolvedValueOnce(candidates)

    await expect(searchCoverCandidates(query)).resolves.toEqual(candidates)
    expect(invokeMock).toHaveBeenCalledWith('search_cover_candidates', { query })
  })

  it('delegates cover import requests to the Tauri backend', async () => {
    invokeMock.mockResolvedValueOnce('covers/ab/mock-cover.jpg')

    await expect(
      importCoverFromUrl(42, 'lp', 'https://example.com/image.jpg'),
    ).resolves.toBe('covers/ab/mock-cover.jpg')

    expect(invokeMock).toHaveBeenCalledWith('import_cover_from_url', {
      imageUrl: 'https://example.com/image.jpg',
      recordId: 42,
      suffix: 'lp',
    })
  })
})