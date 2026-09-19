import { ElectronAPI } from '@electron-toolkit/preload'
import type { ContainerApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    container: ContainerApi
  }
}
