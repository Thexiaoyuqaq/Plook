import { AnimatePresence, motion } from 'motion/react'
import { Crown } from 'lucide-react'
import { useRoomStore } from '../../store/roomStore'

export default function MemberList() {
  const members = useRoomStore((s) => s.members)

  return (
    <ul className="flex flex-wrap gap-1.5 px-3.5 py-2" style={{ borderBottom: '1px solid var(--line)', listStyle: 'none', margin: 0 }}>
      <AnimatePresence initial={false}>
        {members.map((m) => (
          <motion.li
            key={m.name}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="chip"
            style={{ color: m.online ? 'var(--text)' : 'var(--muted)', opacity: m.online ? 1 : 0.65 }}
          >
            <span className={m.online ? 'dot dot-on' : 'dot dot-off'} />
            <span>{m.name}</span>
            {m.owner && <Crown size={12} style={{ color: 'var(--warning)' }} />}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
