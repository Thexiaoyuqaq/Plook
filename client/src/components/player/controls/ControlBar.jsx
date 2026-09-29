import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react'

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export default function ControlBar({ ui, actions, visible = true, locked = false }) {
  const [rateOpen, setRateOpen] = useState(false)
  const { paused, currentTime, duration, volume, muted, rate, buffered, fullscreen } = ui
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0
  const progress = dur ? (currentTime / dur) * 100 : 0
  const buffer = dur ? (buffered / dur) * 100 : 0
  const activeRate = rate || 1

  const btn = { border: 0, background: 'transparent', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }

  return (
    <motion.div
      className="glass-strong absolute inset-x-2 bottom-2 z-20 flex items-center gap-2 px-3 py-2"
      style={{ borderRadius: 16, pointerEvents: !visible || locked ? 'none' : 'auto' }}
      initial={false}
      animate={{ opacity: visible ? (locked ? 0.55 : 1) : 0, y: visible ? 0 : 12 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <button style={{ ...btn, width: 34, height: 34 }} onClick={actions.togglePlay} aria-label={paused ? '播放' : '暂停'}>
        {paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
      </button>

      <span className="tabular-nums text-xs" style={{ color: '#fff', minWidth: 42, textAlign: 'center' }}>{fmt(currentTime)}</span>

      <div className="relative flex-1" style={{ height: 16, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', inset: '0 0', top: '50%', transform: 'translateY(-50%)', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${buffer}%`, background: 'rgba(255,255,255,0.28)' }} />
          <div style={{ position: 'absolute', inset: 0, width: `${progress}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
        </div>
        <input
          type="range"
          min={0}
          max={dur || 0}
          step="any"
          value={Number.isFinite(currentTime) ? currentTime : 0}
          onChange={(e) => actions.seek(Number(e.target.value))}
          aria-label="进度"
          className="absolute inset-0 m-0 w-full cursor-pointer opacity-0"
          style={{ height: 16 }}
        />
      </div>

      <span className="tabular-nums text-xs" style={{ color: '#fff', minWidth: 42, textAlign: 'center' }}>{fmt(dur)}</span>

      <button style={{ ...btn, width: 32, height: 32 }} onClick={actions.toggleMute} aria-label="静音">
        {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => actions.setVolume(Number(e.target.value))}
        aria-label="音量"
        className="hidden cursor-pointer sm:block"
        style={{ width: 72, accentColor: 'var(--accent)' }}
      />

      <div className="relative">
        <button className="text-xs font-bold" style={{ height: 30, minWidth: 44, borderRadius: 9, border: 0, background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer' }} onClick={() => setRateOpen((v) => !v)} aria-label="倍速">
          {activeRate}x
        </button>
        <AnimatePresence>
          {rateOpen && (
            <motion.div
              className="glass-strong absolute right-0 z-30 grid gap-1 p-1.5"
              style={{ bottom: 40, borderRadius: 12, minWidth: 72 }}
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 400, damping: 26 }}
            >
              {RATES.map((r) => (
                <button
                  key={r}
                  className="text-sm"
                  style={{ padding: '6px 10px', borderRadius: 8, border: 0, cursor: 'pointer', color: r === activeRate ? '#fff' : 'var(--text)', background: r === activeRate ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'transparent' }}
                  onClick={() => {
                    actions.changeRate(r)
                    setRateOpen(false)
                  }}
                >
                  {r}x
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button style={{ ...btn, width: 32, height: 32 }} onClick={actions.toggleFullscreen} aria-label="全屏">
        {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>
    </motion.div>
  )
}
