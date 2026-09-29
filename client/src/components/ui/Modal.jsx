import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, subtitle, children, maxWidth = 460 }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[900] grid place-items-center p-4"
          style={{ background: 'rgba(4,6,16,0.5)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            className="glass-strong w-full"
            style={{ maxWidth, borderRadius: 24, padding: 22 }}
            initial={{ opacity: 0, scale: 0.9, y: 24, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.94, y: 16, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="m-0 text-lg font-bold">{title}</h2>
                {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
              </div>
              {onClose && (
                <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="关闭" onClick={onClose}>
                  <X size={18} />
                </button>
              )}
            </header>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
