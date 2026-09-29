const STATUS = {
  idle: { text: '未连接', color: 'var(--muted)' },
  connecting: { text: '连接中', color: 'var(--warning)' },
  open: { text: '已连接', color: 'var(--success)' },
  closed: { text: '已断开', color: 'var(--danger)' },
  reconnecting: { text: '重连中', color: 'var(--warning)' },
  error: { text: '连接异常', color: 'var(--danger)' },
}

export default function StatusPill({ status }) {
  const info = STATUS[status] || { text: status, color: 'var(--muted)' }
  return (
    <span className="chip" style={{ color: info.color }}>
      <span className="dot" style={{ background: info.color }} />
      {info.text}
    </span>
  )
}
