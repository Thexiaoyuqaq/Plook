import { motion } from 'motion/react'

/** options: [{label, value}]  自定义分段选择器（含滑块动画） */
export default function Segmented({ options, value, onChange, disabled = false }) {
  return (
    <div
      className="glass"
      style={{ display: 'inline-flex', padding: 4, borderRadius: 14, gap: 4, opacity: disabled ? 0.5 : 1 }}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange?.(opt.value)}
            className="relative"
            style={{
              border: 0,
              background: 'transparent',
              color: active ? '#fff' : 'var(--muted)',
              padding: '8px 16px',
              borderRadius: 10,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 13,
              zIndex: 1,
            }}
          >
            {active && (
              <motion.span
                layoutId="segmented-active"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 10,
                  zIndex: -1,
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                }}
              />
            )}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
