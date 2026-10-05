import { useSyncExternalStore } from "react"

// State for the guest walkthrough. "Done" survives reloads so it only
// auto-starts on a guest's first visit; "active" is just this page view.

const DONE_KEY = "orvia.guest.tourDone"
const listeners = new Set<() => void>()
let active = false

function emit() { listeners.forEach(l => l()) }

export function isTourDone(): boolean {
  try { return localStorage.getItem(DONE_KEY) === "1" } catch { return false }
}

export function startTour() {
  active = true
  emit()
}

export function endTour() {
  active = false
  try { localStorage.setItem(DONE_KEY, "1") } catch { /* storage unavailable */ }
  emit()
}

// Forget that the tour was seen, so the next guest to arrive gets it.
export function resetTourDone() {
  try { localStorage.removeItem(DONE_KEY) } catch { /* storage unavailable */ }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function useTourActive(): boolean {
  return useSyncExternalStore(subscribe, () => active, () => false)
}
