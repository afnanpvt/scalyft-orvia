import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"

export type Theme = "light" | "dark" | "system"

interface ThemeContext {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
  saveTheme: (userId: string, theme: Theme) => Promise<void>
}

const ThemeCtx = createContext<ThemeContext | undefined>(undefined)

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme
  document.documentElement.classList.toggle("dark", resolved === "dark")
  return resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("orvia-theme") as Theme | null
    // Only honour stored value if user explicitly set it (not a leftover "system" from before feature existed)
    return stored ?? "light"
  })
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    const stored = (localStorage.getItem("orvia-theme") as Theme | null) ?? "light"
    return applyTheme(stored)
  })

  useEffect(() => {
    const resolved = applyTheme(theme)
    setResolvedTheme(resolved)
    localStorage.setItem("orvia-theme", theme)
  }, [theme])

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      const resolved = applyTheme("system")
      setResolvedTheme(resolved)
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  function setTheme(t: Theme) {
    setThemeState(t)
  }

  async function saveTheme(userId: string, t: Theme) {
    setTheme(t)
    await supabase.from("users").update({ theme_preference: t }).eq("id", userId)
  }

  return (
    <ThemeCtx.Provider value={{ theme, resolvedTheme, setTheme, saveTheme }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
