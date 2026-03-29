import { convertFileSrc } from '@tauri-apps/api/core'

interface RecordLike {
  artist: string | null
  title: string | null
}

export function getImageSrc(path: string | null | undefined): string {
  if (!path) {
    return ''
  }

  return convertFileSrc(path)
}

export function buildGoogleCoverSearchUrl(record: RecordLike | null): string | null {
  if (!record) {
    return null
  }

  const queryTerms = [record.artist, record.title]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value.length > 0)

  if (queryTerms.length === 0) {
    return null
  }

  const query = [...queryTerms, 'album cover'].join(' ')

  if (!query) {
    return null
  }

  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`
}