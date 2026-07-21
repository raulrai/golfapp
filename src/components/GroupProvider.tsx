'use client'
import { createContext, useContext } from 'react'
import type { Group } from '@/lib/auth'

/** The active group, resolved server-side in the root layout and handed down.
 *
 *  Passing it through context rather than having each component fetch it means
 *  there is never a frame where the Money tab renders and then disappears —
 *  which is what a client-side fetch of tracksMoney would produce on every load.
 *
 *  null when nobody has picked a group yet (pre-login). Callers should treat
 *  "no group" as "show nothing money-shaped".
 */
const GroupContext = createContext<Group | null>(null)

export function GroupProvider({ group, children }: { group: Group | null; children: React.ReactNode }) {
  return <GroupContext.Provider value={group}>{children}</GroupContext.Provider>
}

export function useGroup(): Group | null {
  return useContext(GroupContext)
}

/** Does the active group track money? Defaults to false when no group is set,
 *  so money never leaks into a pre-login or unknown state. */
export function useTracksMoney(): boolean {
  return useContext(GroupContext)?.tracksMoney === true
}
