import type { ManagerApi } from '../shared/types'

declare global {
  interface Window {
    api: ManagerApi
  }
}

export {}
