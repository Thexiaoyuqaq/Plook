import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useIsMobile } from '../../hooks/useMediaQuery'

export default function Drawer({ open, onClose, title, subtitle, children }) {
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const panelMotion = isMobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } }

  const panelStyle = isMobile
    ? { left: 0, right: 0, bottom: 0, maxHeight: '86vh', borderRadius: '24px 24px 0 0' }
    : { top: 0, right: 0, bottom: 0, width: 'min(440px, 92vw)', borderRadius: '24px 0 0 24px' }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[900]"
          style={{ background: 'rgba(4,6,16,0.5)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.aside
            className="glass-strong absolute overflow-y-auto"
            style={{ ...panelStyle, padding: 22 }}
            {...panelMotion}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="m-0 text-lg font-bold">{title}</h2>
                {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
              </div>
              <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="关闭" onClick={onClose}>
                <X size={18} />
              </button>
            </header>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
