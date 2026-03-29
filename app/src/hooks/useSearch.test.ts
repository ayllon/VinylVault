import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSearch } from './useSearch'
import { invokeMock } from '../test/mocks/tauri'

describe('useSearch', () => {
  describe('loadComboboxes', () => {
    it('loads groups, titles, and formats into state', async () => {
      invokeMock.mockResolvedValueOnce({
        groups: ['Miles Davis', 'Nina Simone'],
        titles: ['Kind of Blue', 'I Put a Spell on You'],
        formatos: ['LP', 'CD'],
      })

      const { result } = renderHook(() => useSearch())

      await act(async () => {
        await result.current.loadComboboxes()
      })

      expect(invokeMock).toHaveBeenCalledWith('get_groups_and_titles')
      expect(result.current.groups).toEqual(['Miles Davis', 'Nina Simone'])
      expect(result.current.titles).toEqual(['Kind of Blue', 'I Put a Spell on You'])
      expect(result.current.formats).toEqual(['LP', 'CD'])
    })

    it('keeps previous state when loading comboboxes fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { result } = renderHook(() => useSearch())

      act(() => {
        result.current.setGroups(['Existing Artist'])
        result.current.setTitles(['Existing Album'])
        result.current.setFormats(['Cassette'])
      })

      invokeMock.mockRejectedValueOnce(new Error('network error'))

      await act(async () => {
        await result.current.loadComboboxes()
      })

      expect(result.current.groups).toEqual(['Existing Artist'])
      expect(result.current.titles).toEqual(['Existing Album'])
      expect(result.current.formats).toEqual(['Cassette'])
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load groups, titles, and formats',
        expect.any(Error),
      )

      consoleSpy.mockRestore()
    })
  })

  describe('findRecordOffset', () => {
    it('returns offset for a column/value pair', async () => {
      invokeMock.mockResolvedValueOnce(7)

      const { result } = renderHook(() => useSearch())

      let offset = -1
      await act(async () => {
        offset = await result.current.findRecordOffset('artist', 'Nina Simone')
      })

      expect(invokeMock).toHaveBeenCalledWith('find_record_offset', {
        column: 'artist',
        value: 'Nina Simone',
      })
      expect(offset).toBe(7)
    })

    it('rejects when backend lookup fails', async () => {
      const lookupError = new Error('lookup failed')
      invokeMock.mockRejectedValueOnce(lookupError)

      const { result } = renderHook(() => useSearch())

      await expect(result.current.findRecordOffset('title', 'Unknown')).rejects.toThrow(
        'lookup failed',
      )
    })
  })
})
