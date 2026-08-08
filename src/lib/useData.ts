import { useSyncExternalStore } from 'react'
import { getData, subscribeData } from './data'
import type { AppData } from './types'

/**
 * The directory. Null only for the first tick or two, while the bundled copy
 * loads; it then re-renders once more if live Supabase data arrives.
 */
export function useData(): AppData | null {
  return useSyncExternalStore(subscribeData, getData, getData)
}
