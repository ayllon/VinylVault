import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CoverCandidate } from '../coverLookup'
import { invokeMock } from '../test/mocks/tauri'
import type { RecordData } from '../types'
import { useCover } from './useCover'

const mockRecord: RecordData = {
  id: 1,
  artist: 'Test Artist',
  title: 'Test Album',
  format: 'LP',
  year: '2024',
  style: null,
  country: null,
  tracks: null,
  credits: null,
  edition: null,
  notes: null,
  cd_cover_path: null,
  lp_cover_path: null,
}

/** Minimal synthetic event that satisfies handleCoverContextMenu's signature. */
function makeSyntheticMouseEvent(x = 100, y = 200) {
  return {
    preventDefault: vi.fn(),
    clientX: x,
    clientY: y,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('useCover – context menu dismissal', () => {
  it('closes the context menu when a mousedown event fires outside the menu element', () => {
    const { result } = renderHook(() =>
      useCover({ currentRecord: null, setCurrentRecord: vi.fn() }),
    )

    // Open the context menu
    act(() => {
      result.current.handleCoverContextMenu(makeSyntheticMouseEvent(), 'cd')
    })
    expect(result.current.contextMenu).not.toBeNull()

    // Attach a real DOM node to contextMenuRef so the "outside" check has something to compare
    const menuNode = document.createElement('div')
    document.body.appendChild(menuNode)
    result.current.contextMenuRef.current = menuNode

    // Create a separate node that is NOT inside the menu
    const outsideNode = document.createElement('div')
    document.body.appendChild(outsideNode)

    act(() => {
      outsideNode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(result.current.contextMenu).toBeNull()

    menuNode.remove()
    outsideNode.remove()
  })

  it('keeps the context menu open when mousedown fires inside the menu element', () => {
    const { result } = renderHook(() =>
      useCover({ currentRecord: null, setCurrentRecord: vi.fn() }),
    )

    act(() => {
      result.current.handleCoverContextMenu(makeSyntheticMouseEvent(), 'lp')
    })
    expect(result.current.contextMenu).not.toBeNull()

    const menuNode = document.createElement('div')
    const innerNode = document.createElement('span')
    menuNode.appendChild(innerNode)
    document.body.appendChild(menuNode)
    result.current.contextMenuRef.current = menuNode

    act(() => {
      innerNode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    // Menu should remain open
    expect(result.current.contextMenu).not.toBeNull()

    menuNode.remove()
  })

  it('closes the context menu when the Escape key is pressed', () => {
    const { result } = renderHook(() =>
      useCover({ currentRecord: null, setCurrentRecord: vi.fn() }),
    )

    act(() => {
      result.current.handleCoverContextMenu(makeSyntheticMouseEvent(), 'cd')
    })
    expect(result.current.contextMenu).not.toBeNull()

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(result.current.contextMenu).toBeNull()
  })

  it('does not close the context menu for non-Escape key presses', () => {
    const { result } = renderHook(() =>
      useCover({ currentRecord: null, setCurrentRecord: vi.fn() }),
    )

    act(() => {
      result.current.handleCoverContextMenu(makeSyntheticMouseEvent(), 'cd')
    })
    expect(result.current.contextMenu).not.toBeNull()

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    })

    expect(result.current.contextMenu).not.toBeNull()
  })

  it('removes event listeners when the context menu is closed', () => {
    const addSpy = vi.spyOn(globalThis, 'addEventListener')
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener')

    const { result } = renderHook(() =>
      useCover({ currentRecord: null, setCurrentRecord: vi.fn() }),
    )

    act(() => {
      result.current.handleCoverContextMenu(makeSyntheticMouseEvent(), 'cd')
    })

    // Three listeners registered: mousedown, keydown, resize
    const addedNames = addSpy.mock.calls.map(([name]) => name)
    expect(addedNames).toContain('mousedown')
    expect(addedNames).toContain('keydown')
    expect(addedNames).toContain('resize')

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    const removedNames = removeSpy.mock.calls.map(([name]) => name)
    expect(removedNames).toContain('mousedown')
    expect(removedNames).toContain('keydown')
    expect(removedNames).toContain('resize')
  })
})

describe('useCover – lookup stale-result cancellation', () => {
  it('discards search results that resolve after closeCoverLookup is called', async () => {
    const mockCandidate: CoverCandidate = {
      release_id: 'r1',
      release_group_id: null,
      title: 'Mock Album',
      artist: 'Mock Artist',
      date: null,
      country: null,
      format: null,
      score: 100,
      thumbnail_url: 'https://example.com/thumb.jpg',
      image_url: 'https://example.com/image.jpg',
      source_url: 'https://example.com',
    }

    // Capture resolver so we can resolve the search manually
    let resolveSearch!: (value: CoverCandidate[]) => void
    invokeMock.mockImplementationOnce(
      () => new Promise<CoverCandidate[]>((resolve) => { resolveSearch = resolve }),
    )

    const { result } = renderHook(() =>
      useCover({ currentRecord: mockRecord, setCurrentRecord: vi.fn() }),
    )

    // Fire openCoverLookup – synchronous part runs (sets isLoading: true),
    // then suspends at `await searchCoverCandidates`
    act(() => {
      void result.current.openCoverLookup('cd')
    })

    expect(result.current.coverLookup.isLoading).toBe(true)
    expect(result.current.coverLookup.isOpen).toBe(true)

    // Cancel the in-flight lookup; this increments lookupSeqRef.current
    act(() => {
      result.current.closeCoverLookup()
    })

    expect(result.current.coverLookup.isOpen).toBe(false)
    expect(result.current.coverLookup.isLoading).toBe(false)

    // Let the stale search resolve
    await act(async () => {
      resolveSearch([mockCandidate])
      // Flush micro-task queue so the continuation inside openCoverLookup runs
      await Promise.resolve()
    })

    // The stale result must be ignored – lookup stays closed and has no candidates
    expect(result.current.coverLookup.isOpen).toBe(false)
    expect(result.current.coverLookup.candidates).toHaveLength(0)
  })

  it('applies search results when the lookup is not cancelled', async () => {
    const mockCandidate: CoverCandidate = {
      release_id: 'r2',
      release_group_id: null,
      title: 'Fresh Album',
      artist: 'Fresh Artist',
      date: null,
      country: null,
      format: null,
      score: 95,
      thumbnail_url: 'https://example.com/thumb2.jpg',
      image_url: 'https://example.com/image2.jpg',
      source_url: 'https://example.com',
    }

    let resolveSearch!: (value: CoverCandidate[]) => void
    invokeMock.mockImplementationOnce(
      () => new Promise<CoverCandidate[]>((resolve) => { resolveSearch = resolve }),
    )

    const { result } = renderHook(() =>
      useCover({ currentRecord: mockRecord, setCurrentRecord: vi.fn() }),
    )

    act(() => {
      void result.current.openCoverLookup('lp')
    })

    expect(result.current.coverLookup.isLoading).toBe(true)

    // Resolve WITHOUT cancelling
    await act(async () => {
      resolveSearch([mockCandidate])
      await Promise.resolve()
    })

    expect(result.current.coverLookup.isOpen).toBe(true)
    expect(result.current.coverLookup.candidates).toHaveLength(1)
    expect(result.current.coverLookup.candidates[0].release_id).toBe('r2')
  })
})
