import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { socket } from '../../lib/socket'
import { useRoomStore, selectIsConnected } from '../../store/roomStore'

export default function JoinRoomModal({ open, roomId, needsPassword, errorText, onClose }) {
  const connected = useRoomStore(selectIsConnected)
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (open) setPassword('')
  }, [open, roomId])

  function submit(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(roomId)) return toast.error('请输入 6 位数字房间号')
    if (needsPassword && !password.trim()) return toast.error('请输入房间密码')
    socket.joinRoom({ roomId, password: password.trim() })
    onClose?.()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="加入房间"
      subtitle={`房间号 #${roomId}${needsPassword ? ' · 需要密码' : ''}`}
    >
      <form className="grid gap-4" onSubmit={submit}>
        <Input
          label="房间密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={40}
          placeholder={needsPassword ? '请输入房间密码' : '如房间有密码请填写'}
          autoFocus
        />
        {errorText && <p className="m-0 text-sm" style={{ color: 'var(--danger)' }}>{errorText}</p>}
        <Button type="submit" className="w-full" disabled={!connected || (needsPassword && !password.trim())}>
          加入房间
        </Button>
      </form>
    </Modal>
  )
}
