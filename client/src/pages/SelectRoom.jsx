import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Plus, Users, Lock, Hash } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import StatusPill from '../components/ui/StatusPill'
import CreateRoomModal from '../components/room/CreateRoomModal'
import JoinRoomModal from '../components/room/JoinRoomModal'
import { socket } from '../lib/socket'
import { useRoomStore, selectIsConnected } from '../store/roomStore'

export default function SelectRoom() {
  const connected = useRoomStore(selectIsConnected)
  const socketStatus = useRoomStore((s) => s.socketStatus)
  const roomList = useRoomStore((s) => s.roomList)
  const passwordPrompt = useRoomStore((s) => s.passwordPrompt)
  const passwordPromptSeq = useRoomStore((s) => s.passwordPromptSeq)

  const [roomId, setRoomId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinRoomId, setJoinRoomId] = useState('')

  const findRoom = (id) => roomList.find((r) => r.roomId === id)
  const joinNeedsPassword = useMemo(
    () => Boolean(findRoom(joinRoomId)?.hasPassword || passwordPrompt),
    [joinRoomId, roomList, passwordPrompt],
  )

  useEffect(() => {
    if (!passwordPrompt) return
    setJoinRoomId(passwordPrompt.roomId || roomId)
    setJoinOpen(true)
  }, [passwordPromptSeq]) // eslint-disable-line react-hooks/exhaustive-deps

  function openJoin(id) {
    setJoinRoomId(id)
    setJoinOpen(true)
  }
  function closeJoin() {
    setJoinOpen(false)
    useRoomStore.getState().clearPasswordPrompt()
  }

  function submitJoin(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(roomId)) return toast.error('请输入 6 位数字房间号')
    const room = findRoom(roomId)
    if (room?.hasPassword) return openJoin(roomId)
    socket.joinRoom({ roomId, password: '' })
  }

  return (
    <section className="mx-auto w-full" style={{ maxWidth: 960 }}>
      <motion.div
        className="glass-strong"
        style={{ borderRadius: 24, padding: 24 }}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24 }}
      >
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-2xl font-extrabold">选择放映房间</h2>
            <p className="mt-1 text-sm text-muted">{roomList.length} 个公开房间 · 私密房间请直接输入房间号</p>
          </div>
          <StatusPill status={socketStatus} />
        </header>

        <form className="mb-4 flex flex-col gap-2.5 sm:flex-row" onSubmit={submitJoin}>
          <div className="relative flex-1">
            <Hash size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
              placeholder="输入 6 位数字房间号"
              style={{ paddingLeft: 40 }}
            />
          </div>
          <Button type="submit" disabled={!/^\d{6}$/.test(roomId) || !connected}>
            加入房间
          </Button>
        </form>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5" style={{ background: 'color-mix(in srgb, var(--glass-bg) 60%, transparent)', border: '1px solid var(--line)' }}>
          <p className="m-0 text-sm text-muted">没有合适的房间？创建一个新的放映厅，系统自动生成房间号。</p>
          <Button variant="ghost" disabled={!connected} onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> 创建房间
          </Button>
        </div>

        {roomList.length === 0 ? (
          <p className="py-10 text-center text-muted">暂无公开房间。私密房间不显示在列表中，请输入房间号加入。</p>
        ) : (
          <motion.div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          >
            {roomList.map((room) => (
              <motion.button
                key={room.roomId}
                type="button"
                onClick={() => (room.hasPassword ? openJoin(room.roomId) : setRoomId(room.roomId))}
                className="glass grid gap-1.5 p-3.5 text-left"
                style={{ borderRadius: 18, cursor: 'pointer' }}
                variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 26 }}
              >
                <strong className="truncate">{room.roomName}</strong>
                <span className="truncate text-xs text-muted">#{room.roomId} · 房主 {room.ownerId || '未知'}</span>
                <small className="flex items-center gap-2 text-muted" style={{ fontSize: 12 }}>
                  <span className="inline-flex items-center gap-1"><Users size={12} /> {room.memberCount}</span>
                  {room.hasPassword && <span className="inline-flex items-center gap-1"><Lock size={12} /> 需要密码</span>}
                </small>
              </motion.button>
            ))}
          </motion.div>
        )}
      </motion.div>

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinRoomModal
        open={joinOpen}
        roomId={joinRoomId}
        needsPassword={joinNeedsPassword}
        errorText={passwordPrompt ? '该房间需要密码，请重新输入' : ''}
        onClose={closeJoin}
      />
    </section>
  )
}
