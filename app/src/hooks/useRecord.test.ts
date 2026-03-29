import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRecord } from './useRecord'
import { invokeMock } from '../test/mocks/tauri'

describe('useRecord', () => {
  describe('loadRecord de-duplication', () => {
    it('applies only the latest result when two calls resolve out of order', async () => {
      let resolveFirst!: (value: unknown) => void
      let resolveSecond!: (value: unknown) => void

      const firstRecord = { id: 1, artist: 'First Artist', title: 'First Album' }
      const secondRecord = { id: 2, artist: 'Second Artist', title: 'Second Album' }

      // First call returns a promise we control; second call resolves immediately
      invokeMock
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirst = resolve
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSecond = resolve
            }),
        )

      const { result } = renderHook(() => useRecord())

      // Fire both calls before either resolves
      act(() => {
        result.current.loadRecord(0)
        result.current.loadRecord(1)
      })

      // Resolve the second (newer) call first, then the first (stale) call
      await act(async () => {
        resolveSecond(secondRecord)
        await Promise.resolve()
      })

      expect(result.current.currentRecord).toEqual(secondRecord)

      await act(async () => {
        resolveFirst(firstRecord)
        await Promise.resolve()
      })

      // The stale first response must not overwrite the newer second response
      expect(result.current.currentRecord).toEqual(secondRecord)
    })
  })

  describe('loadTotalRecords', () => {
    it('updates totalRecords from the backend', async () => {
      invokeMock.mockResolvedValueOnce(42)

      const { result } = renderHook(() => useRecord())

      await act(async () => {
        await result.current.loadTotalRecords()
      })

      expect(invokeMock).toHaveBeenCalledWith('get_total_records')
      expect(result.current.totalRecords).toBe(42)
    })

    it('does not throw when the backend call fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      invokeMock.mockRejectedValueOnce(new Error('db error'))

      const { result } = renderHook(() => useRecord())

      await act(async () => {
        await result.current.loadTotalRecords()
      })

      expect(result.current.totalRecords).toBe(0)
      consoleSpy.mockRestore()
    })
  })
})
