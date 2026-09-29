import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { PlayCircle } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import ThemeToggle from '../components/ui/ThemeToggle'
import { getSavedUserName, saveUserName } from '../lib/session'
import { useRoomStore } from '../store/roomStore'
import favicon from '../assets/favicon.svg'

export default function Login() {
  const navigate = useNavigate()
  const [name, setName] = useState(getSavedUserName())

  useEffect(() => {
    if (getSavedUserName()) navigate('/pc/select-room', { replace: true })
  }, [navigate])

  function submit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('请输入昵称')
      return
    }
    saveUserName(trimmed)
    useRoomStore.getState().setUserName(trimmed)
    navigate('/pc/select-room')
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>
      <motion.section
        className="glass-strong w-full"
        style={{ maxWidth: 420, padding: 30, borderRadius: 26 }}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <div className="mb-6 flex items-center gap-3.5">
          <motion.img
            src={favicon}
            alt="Plook"
            width={52}
            height={52}
            initial={{ rotate: -12, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          />
          <div>
            <h1 className="m-0 text-2xl font-extrabold">
              <span className="accent-text">Plook</span>
            </h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <PlayCircle size={14} /> 一起看视频
            </p>
          </div>
        </div>

        <form className="grid gap-4" onSubmit={submit}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="输入昵称"
            autoFocus
          />
          <Button type="submit" className="w-full">
            进入
          </Button>
        </form>
      </motion.section>
    </main>
  )
}
