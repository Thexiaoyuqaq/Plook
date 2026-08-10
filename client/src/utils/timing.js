export function throttle(fn, wait) {
  let lastRun = 0
  let timer = null
  let lastArgs = null

  return (...args) => {
    const now = Date.now()
    const remaining = wait - (now - lastRun)
    lastArgs = args

    if (remaining <= 0) {
      window.clearTimeout(timer)
      timer = null
      lastRun = now
      fn(...args)
      return
    }

    if (!timer) {
      timer = window.setTimeout(() => {
        timer = null
        lastRun = Date.now()
        fn(...lastArgs)
      }, remaining)
    }
  }
}
