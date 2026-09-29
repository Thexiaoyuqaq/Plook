import { motion } from 'motion/react'

function timeText(sentAt) {
  if (!sentAt) return ''
  return new Date(sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatMessage({ message, userName }) {
  const isSystem = message.type === 'system'
  const isMine = !isSystem && message.ownerId === userName

  if (isSystem) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-1.5 text-center text-xs text-muted"
      >
        {message.text}
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className="mb-2.5 flex flex-col"
      style={{ alignItems: isMine ? 'flex-end' : 'flex-start' }}
    >
      <div className="mb-1 flex items-center gap-2 px-1 text-xs text-muted">
        <span>{isMine ? '我' : message.ownerId}</span>
        <time>{timeText(message.sentAt)}</time>
      </div>
      <div
        className="max-w-[86%] px-3 py-2"
        style={{
          borderRadius: 16,
          borderTopRightRadius: isMine ? 4 : 16,
          borderTopLeftRadius: isMine ? 16 : 4,
          color: isMine ? '#fff' : 'var(--text)',
          background: isMine
            ? 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 45%, var(--accent-2)))'
            : 'var(--glass-bg)',
          border: isMine ? 'none' : '1px solid var(--glass-border)',
          wordBreak: 'break-word',
        }}
      >
        {message.text}
      </div>
    </motion.div>
  )
}
