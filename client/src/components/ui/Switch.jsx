import { motion } from 'motion/react'

export default function Switch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className="inline-flex items-center gap-2.5"
      style={{ background: 'none', border: 0, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
    >
      <span
        style={{
          width: 46,
          height: 28,
          borderRadius: 999,
          padding: 3,
          display: 'flex',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          background: checked
            ? 'linear-gradient(135deg, var(--accent), var(--accent-2))'
            : 'color-mix(in srgb, var(--muted) 40%, transparent)',
          transition: 'background 0.25s ease',
        }}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
          style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
        />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  )
}
