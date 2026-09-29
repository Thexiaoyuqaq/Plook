import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import MemberList from './MemberList'
import ChatMessage from './ChatMessage'
import { socket } from '../../lib/socket'
import { useRoomStore, selectIsConnected, selectOnlineCount, selectPlaybackRate } from '../../store/roomStore'

export default function ChatPanel() {
  const listRef = useRef(null)
  const [text, setText] = useState('')

  const roomName = useRoomStore((s) => s.roomName)
  const currentRoomId = useRoomStore((s) => s.currentRoomId)
  const messages = useRoomStore((s) => s.messages)
  const members = useRoomStore((s) => s.members)
  const userName = useRoomStore((s) => s.userName)
  const connected = useRoomStore(selectIsConnected)
  const onlineCount = useRoomStore(selectOnlineCount)
  const rate = useRoomStore(selectPlaybackRate)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  function submit(e) {
    e.preventDefault()
    if (socket.sendChat(text)) setText('')
  }

  return (
    <aside className="glass flex h-full min-h-0 flex-col" style={{ borderRadius: 20, overflow: 'hidden' }}>
      <header className="flex items-center justify-between gap-3 px-3.5 pb-2.5 pt-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="min-w-0">
          <h2 className="m-0 truncate text-base font-bold">{roomName || '房间消息'}</h2>
          <p className="mt-0.5 text-xs text-muted">
            #{currentRoomId} · {onlineCount}/{members.length} 在线
          </p>
        </div>
        <span className="chip" style={{ color: connected ? 'var(--success)' : 'var(--danger)' }}>
          <span className="dot" style={{ background: connected ? 'var(--success)' : 'var(--danger)' }} />
          {connected ? '在线' : '离线'}
        </span>
      </header>

      <MemberList />

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3" style={{ minHeight: 240 }}>
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} userName={userName} />
        ))}
      </div>

      <form className="flex gap-2 p-3" style={{ borderTop: '1px solid var(--line)' }} onSubmit={submit}>
        <input
          className="field flex-1"
          style={{ height: 42 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="发送消息"
        />
        <button className="icon-btn" type="submit" aria-label="发送" disabled={!connected} style={{ width: 42, height: 42 }}>
          <Send size={18} />
        </button>
      </form>
    </aside>
  )
}
