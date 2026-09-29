import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { LogOut, Settings, DoorOpen, Trash2 } from 'lucide-react'
import { useRoomStore, selectIsRoomOwner } from '../../store/roomStore'
import { socket } from '../../lib/socket'
import { clearSavedUserName } from '../../lib/session'
import IconButton from '../ui/IconButton'
import StatusPill from '../ui/StatusPill'
import ThemeToggle from '../ui/ThemeToggle'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import favicon from '../../assets/favicon.svg'

export default function Header() {
  const navigate = useNavigate()
  const socketStatus = useRoomStore((s) => s.socketStatus)
  const currentRoomId = useRoomStore((s) => s.currentRoomId)
  const roomName = useRoomStore((s) => s.roomName)
  const ownerId = useRoomStore((s) => s.ownerId)
  const hidden = useRoomStore((s) => s.hidden)
  const hasPassword = useRoomStore((s) => s.hasPassword)
  const isOwner = useRoomStore(selectIsRoomOwner)
  const openSettings = useRoomStore((s) => s.openSettings)
  const [confirmDisband, setConfirmDisband] = useState(false)

  const subtitle = currentRoomId
    ? `#${currentRoomId} · ${roomName} · ${isOwner ? '你是房主' : `房主 ${ownerId || '未知'}`} · ${hidden ? '私密' : '公开'} · ${hasPassword ? '有密码' : '无密码'}`
    : '选择或创建放映房间'

  function leaveRoom() {
    socket.leaveRoom()
    toast('已离开房间')
    navigate('/pc/select-room')
  }
  function doDisband() {
    socket.disbandRoom()
    setConfirmDisband(false)
  }
  function logout() {
    clearSavedUserName()
    socket.disconnect()
    useRoomStore.getState().setUserName('')
    navigate('/')
  }

  return (
    <header className="glass sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-3 px-4" style={{ borderRadius: 0 }}>
      <div className="flex min-w-0 items-center gap-3">
        <img src={favicon} alt="Plook" width={34} height={34} />
        <div className="min-w-0">
          <strong className="block text-base leading-tight">Plook</strong>
          <span className="block truncate text-xs text-muted" style={{ maxWidth: 'min(56vw, 620px)' }}>
            {subtitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex">
          <StatusPill status={socketStatus} />
        </span>
        <ThemeToggle />
        {currentRoomId && (
          <IconButton label="房间设置" onClick={openSettings}>
            <Settings size={18} />
          </IconButton>
        )}
        {currentRoomId && !isOwner && (
          <IconButton label="离开房间" onClick={leaveRoom}>
            <DoorOpen size={18} />
          </IconButton>
        )}
        {isOwner && (
          <IconButton label="解散房间" onClick={() => setConfirmDisband(true)} style={{ color: 'var(--danger)' }}>
            <Trash2 size={18} />
          </IconButton>
        )}
        <IconButton label="退出登录" onClick={logout}>
          <LogOut size={18} />
        </IconButton>
      </div>

      <Modal
        open={confirmDisband}
        onClose={() => setConfirmDisband(false)}
        title="解散房间"
        subtitle="房间内所有成员都会被移出，操作不可撤销。"
      >
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDisband(false)}>
            取消
          </Button>
          <Button variant="danger" onClick={doDisband}>
            确认解散
          </Button>
        </div>
      </Modal>
    </header>
  )
}
