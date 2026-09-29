import { useState } from 'react'
import { toast } from 'sonner'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Switch from '../ui/Switch'
import Button from '../ui/Button'
import { socket } from '../../lib/socket'
import { useRoomStore, selectIsConnected } from '../../store/roomStore'

export default function CreateRoomModal({ open, onClose }) {
  const connected = useRoomStore(selectIsConnected)
  const [roomName, setRoomName] = useState('')
  const [password, setPassword] = useState('')
  const [hidden, setHidden] = useState(false)

  function submit(e) {
    e.preventDefault()
    const name = roomName.trim()
    if (!name) return toast.error('请输入房间名')
    socket.createRoom({ roomName: name, password: password.trim(), hidden })
    setRoomName('')
    setPassword('')
    setHidden(false)
    onClose?.()
  }

  return (
    <Modal open={open} onClose={onClose} title="创建房间" subtitle="填写房间名，可选择密码与是否隐藏。">
      <form className="grid gap-4" onSubmit={submit}>
        <Input label="房间名" value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={30} placeholder="例如 周末放映厅" autoFocus />
        <Input label="房间密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={40} placeholder="可选，不填则无密码" />
        <Switch checked={hidden} onChange={setHidden} label="隐藏房间，不显示在公开列表" />
        <Button type="submit" className="w-full" disabled={!connected || !roomName.trim()}>
          确认创建
        </Button>
      </form>
    </Modal>
  )
}
