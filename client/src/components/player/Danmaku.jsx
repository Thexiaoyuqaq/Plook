import { useEffect, useRef, useState } from 'react'
import { useRoomStore } from '../../store/roomStore'

const LANES = 6
let seq = 0

/** 全屏弹幕：全屏时新到的聊天消息以 {name}：{msg} 横向滚动飞过。 */
export default function Danmaku({ active }) {
  const messages = useRoomStore((s) => s.messages)
  const [items, setItems] = useState([])
  const lastLen = useRef(messages.length)
  const laneRef = useRef(0)

  useEffect(() => {
    const prev = lastLen.current
    lastLen.current = messages.length
    if (!active || messages.length <= prev) return
    const fresh = messages.slice(prev).filter((m) => m.type === 'chat' && m.text)
    if (!fresh.length) return
    setItems((cur) => [
      ...cur,
      ...fresh.map((m) => {
        const lane = laneRef.current % LANES
        laneRef.current += 1
        return { key: `${m.id}-${seq++}`, name: m.ownerId, text: m.text, lane, dur: 8 + Math.random() * 4 }
      }),
    ])
  }, [messages, active])

  useEffect(() => {
    if (!active) setItems([])
  }, [active])

  if (!active) return null

  return (
    <div className="absolute inset-0 z-30 overflow-hidden" style={{ pointerEvents: 'none' }} aria-hidden="true">
      {items.map((it) => (
        <div
          key={it.key}
          className="danmaku-item"
          style={{ top: 14 + it.lane * 44, animationDuration: `${it.dur}s` }}
          onAnimationEnd={() => setItems((cur) => cur.filter((x) => x.key !== it.key))}
        >
          <span style={{ color: 'var(--accent-2)' }}>{it.name}</span>
          <span style={{ color: '#fff' }}>：{it.text}</span>
        </div>
      ))}
    </div>
  )
}
