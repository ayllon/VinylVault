import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useImport } from './useImport'
import { listenMock } from '../test/mocks/tauri'

describe('useImport', () => {
  it('registers/unregisters the progress listener and updates state from payloads', async () => {
    const unlisten = vi.fn()
    listenMock.mockImplementationOnce(async (_eventName, callback) => {
      callback({ payload: { percent: 40, processed: 4, total: 10 } })
      return unlisten
    })

    const { result, unmount } = renderHook(() => useImport())

    expect(listenMock).toHaveBeenCalledWith('mdb-import-progress', expect.any(Function))

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.importProcessed).toBe(4)
    expect(result.current.importTotal).toBe(10)
    expect(result.current.importPercent).toBe(40)

    unmount()

    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('unregisters a late listener when unmounted before listen resolves', async () => {
    const unlisten = vi.fn()
    let resolveListen: ((value: () => void) => void) | undefined

    listenMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveListen = resolve
        }),
    )

    const { unmount } = renderHook(() => useImport())

    unmount()

    expect(unlisten).not.toHaveBeenCalled()
    expect(resolveListen).toBeTypeOf('function')

    resolveListen?.(unlisten)

    await act(async () => {
      await Promise.resolve()
    })

    expect(unlisten).toHaveBeenCalledTimes(1)
  })
})
