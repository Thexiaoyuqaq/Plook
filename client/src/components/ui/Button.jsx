import { motion } from 'motion/react'

const VARIANTS = {
  primary: 'btn btn-primary',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-danger',
}

export default function Button({ variant = 'primary', className = '', children, disabled, ...rest }) {
  return (
    <motion.button
      className={`${VARIANTS[variant] || VARIANTS.primary} ${className}`}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      whileHover={disabled ? undefined : { y: -1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}
