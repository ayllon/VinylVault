import { vi } from 'vitest'

type TauriEventCallback = (event: { payload: unknown }) => void

const defaultRecord = {
  artist: null,
  cd_cover_path: null,
  country: null,
  credits: null,
  edition: null,
  format: null,
  id: 1,
  lp_cover_path: null,
  notes: null,
  style: null,
  title: null,
  tracks: null,
  year: null,
}

const defaultInvokeImplementation = async (command: string): Promise<unknown> => {
  switch (command) {
    case 'add_record':
      return 1
    case 'check_for_updates':
      return null
    case 'copy_cover_to_clipboard':
      return null
    case 'delete_cover':
      return null
    case 'delete_record':
      return null
    case 'find_record_offset':
      return 0
    case 'get_groups_and_titles':
      return { groups: [], titles: [], formatos: [] }
    case 'get_record':
      return defaultRecord
    case 'get_total_records':
      return 0
    case 'import_cover_from_url':
      return 'covers/mock-cover.jpg'
    case 'import_mdb':
      return 0
    case 'is_db_empty':
      return true
    case 'paste_cover_from_clipboard':
      return 'covers/mock-cover.jpg'
    case 'search_cover_candidates':
      return []
    case 'update_record':
      return null
    default:
      return null
  }
}

export const invokeMock = vi.fn(defaultInvokeImplementation)
export const convertFileSrcMock = vi.fn((path: string) => `asset://${path}`)
const eventListeners = new Map<string, TauriEventCallback>()

export const listenMock = vi.fn(async (eventName: string, callback: TauriEventCallback) => {
  eventListeners.set(eventName, callback)

  return () => {
    eventListeners.delete(eventName)
  }
})
export const openDialogMock = vi.fn(async () => null)
export const openUrlMock = vi.fn(async () => undefined)
export const writeTextMock = vi.fn(async () => undefined)

export function resetTauriMocks() {
  invokeMock.mockReset()
  invokeMock.mockImplementation(defaultInvokeImplementation)

  convertFileSrcMock.mockReset()
  convertFileSrcMock.mockImplementation((path: string) => `asset://${path}`)

  listenMock.mockReset()
  eventListeners.clear()
  listenMock.mockImplementation(async (eventName: string, callback: TauriEventCallback) => {
    eventListeners.set(eventName, callback)

    return () => {
      eventListeners.delete(eventName)
    }
  })

  openDialogMock.mockReset()
  openDialogMock.mockResolvedValue(null)

  openUrlMock.mockReset()
  openUrlMock.mockResolvedValue(undefined)

  writeTextMock.mockReset()
  writeTextMock.mockResolvedValue(undefined)
}

export function emitTauriEvent(eventName: string, payload: unknown) {
  const callback = eventListeners.get(eventName)
  if (!callback) {
    return
  }

  callback({ payload })
}