import { useCallback, useState } from 'react'

export type Theme = 'dark' | 'light'
const STORAGE_KEY = 'sellsignal-theme'

function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme)

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // storage unavailable (private mode): theme still applies for this session
    }
    setThemeState(next)
  }, [])

  return { theme, setTheme }
}
