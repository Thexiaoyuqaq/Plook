import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Drawer from '../ui/Drawer'
import Input from '../ui/Input'
import Switch from '../ui/Switch'
import Segmented from '../ui/Segmented'
import Button from '../ui/Button'
import { socket } from '../../lib/socket'
import { useRoomStore, selectIsRoomOwner } from '../../store/roomStore'

const TYPE_OPTIONS = [
  { label: 'MP4', value: 'video/mp4' },
  { label: 'M3U8', value: 'm3u8' },
]

export default function RoomSettingsDrawer() {
  const open = useRoomStore((s) => s.settingsOpen)
  const closeSettings = useRoomStore((s) => s.closeSettings)
  const isOwner = useRoomStore(selectIsRoomOwner)
  const roomName = useRoomStore((s) => s.roomName)
  const hidden = useRoomStore((s) => s.hidden)
  const hasPassword = useRoomStore((s) => s.hasPassword)
  const sourceLocked = useRoomStore((s) => s.sourceLocked)
  const videoSource = useRoomStore((s) => s.videoSource)

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [hide, setHide] = useState(false)
  const [src, setSrc] = useState('')
  const [srcType, setSrcType] = useState('video/mp4')

  useEffect(() => {
    if (!open) return
    setName(roomName)
    setPassword('')
    setHide(hidden)
    setSrc(videoSource?.src || '')
    setSrcType(videoSource?.type || 'video/mp4')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const canEditSource = !sourceLocked || isOwner

  function saveRoom(e) {
    e.preventDefault()
    if (!isOwner) return
    if (!name.trim()) return toast.error('房间名不能为空')
    socket.updateRoomSettings({ roomName: name.trim(), password: password.trim(), hidden: hide })
    setPassword('')
    toast.success('房间设置已保存')
  }

  function saveSource(e) {
    e.preventDefault()
    if (!src.trim()) return toast.error('请输入视频源地址')
    try {
      const url = new URL(src.trim())
      if (!['http:', 'https:'].includes(url.protocol)) return toast.error('只支持 HTTP/HTTPS 视频源')
    } catch {
      return toast.error('请输入正确的视频源地址')
    }
    if (socket.sendSource({ src: src.trim(), type: srcType })) toast.success('视频源已提交')
  }

  return (
    <Drawer open={open} onClose={closeSettings} title="房间设置" subtitle={isOwner ? '你是房主，可调整可见性、密码与视频源。' : '仅房主可调整设置。'}>
      <form className="mb-4 grid gap-3.5" onSubmit={saveRoom}>
        <h3 className="m-0 text-sm font-bold text-muted">房间信息</h3>
        <Input label="房间名" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} disabled={!isOwner} />
        <Input
          label="房间密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={40}
          disabled={!isOwner}
          placeholder={hasPassword ? '留空将清除当前密码' : '可选，不填则无密码'}
        />
        <Switch checked={hide} onChange={setHide} disabled={!isOwner} label="隐藏房间，不显示在公开列表" />
        <Button type="submit" disabled={!isOwner}>保存房间设置</Button>
      </form>

      <form className="grid gap-3.5" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }} onSubmit={saveSource}>
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-sm font-bold text-muted">视频源</h3>
          <span className="chip">{sourceLocked ? '已锁定' : '未锁定'}</span>
        </div>
        {isOwner && (
          <Switch checked={sourceLocked} onChange={(v) => socket.setSourceLocked(v)} label="锁定视频源（仅房主可改）" />
        )}
        <Input label="视频源地址" value={src} onChange={(e) => setSrc(e.target.value)} disabled={!canEditSource} placeholder="https://samplelib.com/mp4/sample-10s-2160p.mp4" />
        <div className="grid gap-1.5">
          <span className="text-xs text-muted">视频类型</span>
          <Segmented options={TYPE_OPTIONS} value={srcType} onChange={setSrcType} disabled={!canEditSource} />
        </div>
        <Button type="submit" disabled={!canEditSource}>切换视频源</Button>
      </form>
    </Drawer>
  )
}
