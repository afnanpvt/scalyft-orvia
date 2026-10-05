import { useSyncExternalStore } from "react"
import type { Niche } from "@/lib/vapi/niche-profiles"

// Guest mode: someone looking around without an account. There's no Supabase
// session and no tenant. The guest picks a domain (dental, plumbing...) and
// gets a generic business of that type whose data lives only in this browser.
// The choice is kept in localStorage so a refresh doesn't drop them out.

const KEY = "orvia.guest"
const listeners = new Set<() => void>()
let cache: { raw: string | null; niche: Niche | null } = { raw: null, niche: null }

const NICHES: Niche[] = ["dental", "plumbing", "hvac", "real_estate", "customer_support"]

function read(): Niche | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY) } catch { /* storage unavailable */ }
  if (raw === cache.raw) return cache.niche
  let niche: Niche | null = null
  try {
    const n = raw ? (JSON.parse(raw) as { niche?: Niche }).niche : null
    niche = n && NICHES.includes(n) ? n : null
  } catch { /* corrupt: not a guest */ }
  cache = { raw, niche }
  return niche
}

function emit() { listeners.forEach(l => l()) }

export function getGuestNiche(): Niche | null { return read() }
export function isGuest(): boolean { return read() !== null }

export function startGuest(niche: Niche) {
  try { localStorage.setItem(KEY, JSON.stringify({ niche })) } catch { /* storage unavailable */ }
  emit()
}

export function endGuest() {
  try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ }
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb() }
  window.addEventListener("storage", onStorage)
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage) }
}

export function useGuestNiche(): Niche | null {
  return useSyncExternalStore(subscribe, read, () => null)
}
