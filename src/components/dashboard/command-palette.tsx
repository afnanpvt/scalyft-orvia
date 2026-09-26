import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Search, Phone, Calendar, UserPlus, Settings, ArrowRight, LayoutDashboard, AlertTriangle, X } from "lucide-react"
import { globalSearch, type SearchResult } from "@/lib/api"

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(pointer: coarse), (max-width: 640px)").matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 640px)")
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return isMobile
}

type StaticItem = {
  kind: "page"
  id: string
  title: string
  subtitle: string
  href: string
  icon: typeof Search
}

const STATIC_PAGES: StaticItem[] = [
  { kind: "page", id: "overview",      title: "Overview",      subtitle: "Dashboard",            href: "/",             icon: LayoutDashboard },
  { kind: "page", id: "calls",         title: "Calls",         subtitle: "All call history",     href: "/calls",        icon: Phone },
  { kind: "page", id: "appointments",  title: "Appointments",  subtitle: "Upcoming and past",    href: "/appointments", icon: Calendar },
  { kind: "page", id: "leads",         title: "Leads",         subtitle: "Captured prospects",   href: "/leads",        icon: UserPlus },
  { kind: "page", id: "needs-action",  title: "Needs Action",  subtitle: "Issues and queue",     href: "/needs-action", icon: AlertTriangle },
  { kind: "page", id: "settings",      title: "Settings",      subtitle: "Business & AI config", href: "/settings",     icon: Settings },
]

function iconFor(r: SearchResult | StaticItem) {
  if (r.kind === "page") return r.icon
  if (r.kind === "call") return Phone
  if (r.kind === "appointment") return Calendar
  return UserPlus
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const debouncedQuery = useDebounced(query, 180)

  // global hotkeys: cmd/ctrl+k, "/" (when not typing somewhere), plus a
  // custom "open-command-palette" event
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(v => !v)
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === "Escape" && open) {
        setOpen(false)
      }
    }
    function onOpen() { setOpen(true) }
    window.addEventListener("keydown", onKey)
    window.addEventListener("open-command-palette", onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("open-command-palette", onOpen)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery(""); setActive(0); setResults([])
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  // live search
  useEffect(() => {
    let cancelled = false
    const q = debouncedQuery.trim()
    if (q.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    globalSearch(q).then(rows => {
      if (!cancelled) { setResults(rows); setLoading(false); setActive(0) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedQuery])

  const filteredStatic = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return STATIC_PAGES
    return STATIC_PAGES.filter(p =>
      p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q),
    )
  }, [query])

  const combined: (StaticItem | SearchResult)[] = useMemo(() => {
    return [...filteredStatic, ...results]
  }, [filteredStatic, results])

  function go(item: StaticItem | SearchResult) {
    setOpen(false)
    navigate({ to: item.href })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault(); setActive(a => Math.min(a + 1, combined.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); setActive(a => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = combined[active]
      if (item) go(item)
    }
  }

  if (!open) return null

  const pages = filteredStatic
  const hits = results

  return (
    <div
      role="dialog"
      aria-modal
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", justifyContent: "center",
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        padding: isMobile ? "12vh 12px 12px" : "10vh 16px 16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 580, alignSelf: "flex-start",
          background: "var(--popover)", color: "var(--foreground)",
          borderRadius: 16, overflow: "hidden",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.25), 0 6px 16px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", borderBottom: "1px solid var(--border)",
        }}>
          <Search size={15} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="text"
            placeholder={isMobile ? "Search…" : "Search calls, appointments, leads…"}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            style={{
              flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
              fontSize: 14, color: "var(--foreground)", fontFamily: "inherit",
            }}
          />
          {isMobile ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close search"
              style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "var(--muted)", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--muted-foreground)",
              }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          ) : (
            <kbd style={{
              fontSize: 10, fontWeight: 600, padding: "3px 6px",
              background: "var(--muted)", borderRadius: 6,
              color: "var(--muted-foreground)", letterSpacing: "0.04em", flexShrink: 0,
            }}>ESC</kbd>
          )}
        </div>

        <div style={{ maxHeight: 440, overflowY: "auto" }}>
          {pages.length > 0 && (
            <div>
              <div style={sectionLabelStyle}>Pages</div>
              {pages.map((p, i) => (
                <ResultRow key={p.id} item={p} active={active === i} isMobile={isMobile}
                  onSelect={() => go(p)} onHover={() => setActive(i)} />
              ))}
            </div>
          )}

          {query.trim().length >= 2 && (
            <div>
              <div style={sectionLabelStyle}>
                Results {loading && <span style={{ marginLeft: 6, opacity: 0.6 }}>loading...</span>}
              </div>
              {!loading && hits.length === 0 ? (
                <p style={{ padding: "16px 18px", fontSize: 13, color: "var(--muted-foreground)" }}>
                  No matches.
                </p>
              ) : (
                hits.map((r, i) => {
                  const idx = pages.length + i
                  return (
                    <ResultRow key={`${r.kind}-${r.id}`} item={r} active={active === idx} isMobile={isMobile}
                      onSelect={() => go(r)} onHover={() => setActive(idx)} />
                  )
                })
              )}
            </div>
          )}
        </div>

        {!isMobile && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px", borderTop: "1px solid var(--border)",
            fontSize: 11, color: "var(--muted-foreground)",
          }}>
            <span><kbd style={kbdStyle}>↑</kbd> <kbd style={kbdStyle}>↓</kbd> navigate · <kbd style={kbdStyle}>↵</kbd> open</span>
            <span><kbd style={kbdStyle}>esc</kbd> close</span>
          </div>
        )}
      </div>
    </div>
  )
}

const sectionLabelStyle: React.CSSProperties = {
  padding: "10px 18px 5px",
  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.07em", color: "var(--muted-foreground)",
}

const kbdStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, padding: "2px 5px",
  background: "var(--muted)", borderRadius: 4,
  color: "var(--muted-foreground)",
}

function ResultRow({ item, active, isMobile, onSelect, onHover }: {
  item: StaticItem | SearchResult
  active: boolean
  isMobile: boolean
  onSelect: () => void
  onHover: () => void
}) {
  const Icon = iconFor(item)
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={isMobile ? undefined : onHover}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: isMobile ? "13px 16px" : "10px 16px", border: "none", cursor: "pointer",
        background: active && !isMobile ? "var(--accent)" : "transparent",
        textAlign: "left",
      }}
    >
      <div style={{
        width: isMobile ? 32 : 28, height: isMobile ? 32 : 28, borderRadius: 8, flexShrink: 0,
        background: "var(--muted)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={isMobile ? 14 : 13} strokeWidth={1.75} style={{ color: "var(--muted-foreground)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
          {item.title}
        </p>
        <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
          {item.subtitle}
        </p>
      </div>
      {active && !isMobile && (
        <ArrowRight size={12} strokeWidth={2} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
      )}
    </button>
  )
}
