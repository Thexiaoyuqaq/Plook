import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ThemeProvider, useTheme } from './theme/ThemeProvider'
import AnimatedBackground from './components/layout/AnimatedBackground'
import Login from './pages/Login'
import Room from './pages/Room'
import SelectRoom from './pages/SelectRoom'
import Watch from './pages/Watch'

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster position="top-center" theme={theme} richColors closeButton toastOptions={{ style: { borderRadius: '14px' } }} />
}

export default function App() {
  return (
    <ThemeProvider>
      <AnimatedBackground />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/pc" element={<Room />}>
            <Route index element={<Navigate to="/pc/select-room" replace />} />
            <Route path="select-room" element={<SelectRoom />} />
            <Route path="video/:roomId" element={<Watch />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <ThemedToaster />
    </ThemeProvider>
  )
}
