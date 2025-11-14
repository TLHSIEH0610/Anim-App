"use client"
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material'
import { PropsWithChildren, useEffect, useMemo, useState } from 'react'

const basePalette = {
  primary: { main: '#2563eb', dark: '#1d4ed8', contrastText: '#ffffff' },
  success: { main: '#10b981' },
  warning: { main: '#f59e0b' },
  error: { main: '#ef4444' },
  info: { main: '#0ea5e9' },
  background: { default: '#f6f8fb', paper: '#ffffff' },
  text: { primary: '#1f2937', secondary: '#4b5563' },
}

export function MUIThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<'light' | 'dark'>(() => (typeof window !== 'undefined' && (localStorage.getItem('theme') as 'light' | 'dark')) || 'light')
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('theme', mode) }, [mode])

  const theme = useMemo(() => createTheme({
    palette: { mode, ...basePalette },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Ubuntu, Cantarell, Helvetica Neue, Arial',
      h1: { fontWeight: 700 }, h2: { fontWeight: 700 }, h3: { fontWeight: 700 },
    },
    components: {
      MuiButton: { styleOverrides: { root: { borderRadius: 999 } } },
      MuiPaper: { styleOverrides: { root: { borderRadius: 12 } } },
    },
  }), [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}

