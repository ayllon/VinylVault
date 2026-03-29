import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import i18n from '../i18n/config'
import {
  convertFileSrcMock,
  invokeMock,
  listenMock,
  openDialogMock,
  openUrlMock,
  resetTauriMocks,
  writeTextMock,
} from './mocks/tauri'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: convertFileSrcMock,
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: openUrlMock,
}))

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: writeTextMock,
}))

beforeEach(async () => {
  resetTauriMocks()
  await i18n.changeLanguage('en')
  vi.stubGlobal('alert', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})