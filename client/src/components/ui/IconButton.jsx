import { motion } from 'motion/react'

export default function IconButton({ className = '', children, label, ...rest }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-btn ${className}`}
      whileTap={{ scale: 0.9 }}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}
