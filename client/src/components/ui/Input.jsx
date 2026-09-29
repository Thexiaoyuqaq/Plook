import { forwardRef } from 'react'

const Input = forwardRef(function Input({ label, className = '', ...rest }, ref) {
  const input = <input ref={ref} className={`field ${className}`} {...rest} />
  if (!label) return input
  return (
    <label className="grid gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      {input}
    </label>
  )
})

export default Input
