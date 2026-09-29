import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { AnimatePresence, motion } from 'motion/react'
import { Film, ChevronsRight, Loader2 } from 'lucide-react'
import ControlBar from './controls/ControlBar'
import Danmaku from './Danmaku'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { socket, registerRemoteVideoHandler, registerResyncHandler } from '../../lib/socket'
import { useRoomStore, selectHasVideoSource } from '../../store/roomStore'
import { ROOM_EVENTS, SOCKET_TYPES, VIDEO_EVENTS, createPlaybackMessage, createSeekMessage } from '../../lib/socketMessages'

const isM3u8 = (source) => source?.type === 'm3u8' || /\.m3u8($|\?)/i.test(source?.src || '')

const HOLD_BEAT = 700 // 长按快进心跳间隔
const HOLD_EXPIRY = 2000 // 超过此时间未收到心跳则认为已松手
const CONTROLS_HIDE = 3000 // 无操作后控件淡出

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export default function VideoPlayer() {
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const seekTs = useRef(0)
  const appliedRef = useRef(false)
  const localRateRef = useRef(false)
  const holdBeatRef = useRef(null)
  const holdExpiryRef = useRef(null)
  const controlsTimerRef = useRef(null)
  const bufferTimerRef = useRef(null)
  const suppressRef = useRef({ seek: null, play: null, rate: null })
  const gestureRef = useRef({ mode: null, startX: 0, startY: 0, startTime: 0, t0: 0, prevRate: 1, timer: null, rateTimer: null })

  const isMobile = useIsMobile()
  const videoSource = useRoomStore((s) => s.videoSource)
  const hasSource = useRoomStore(selectHasVideoSource)
  const userName = useRoomStore((s) => s.userName)
  const holdBy = useRoomStore((s) => s.holdBy)
  const lockedByOther = Boolean(holdBy && holdBy !== userName)

  const [ui, setUi] = useState({ paused: true, currentTime: 0, duration: 0, volume: 1, muted: false, rate: 1, buffered: 0, fullscreen: false, buffering: false })
  const [hint, setHint] = useState(null) // { type:'rate' } | { type:'seek', time, dur, delta }
  const [controlsVisible, setControlsVisible] = useState(true)
  const patch = (p) => setUi((prev) => ({ ...prev, ...p }))

  // 控件自动淡出：有操作/暂停时显示，播放中静置 3s 后淡出。
  const pokeControls = () => {
    setControlsVisible(true)
    clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => {
      if (!videoRef.current || videoRef.current.paused) return
      setControlsVisible(false)
    }, CONTROLS_HIDE)
  }

  const fastLabel = hint?.type === 'rate' ? '快进中 2x' : lockedByOther ? `${holdBy} 快进中 2x` : null

  // 加载视频源（m3u8 走 hls.js，其余原生）。
  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSource?.src) return
    appliedRef.current = false // 新源：允许再做一次初始进度同步
    let hls
    if (isM3u8(videoSource)) {
      if (Hls.isSupported()) {
        // 主动缓冲：向前预缓冲远超当前进度，边播边囤，尽量不卡。
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 60,
          maxMaxBufferLength: 600,
          maxBufferSize: 200 * 1000 * 1000,
          backBufferLength: 60,
        })
        hls.loadSource(videoSource.src)
        hls.attachMedia(video)
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoSource.src // Safari 原生 HLS
      } else {
        video.src = videoSource.src
      }
    } else {
      video.src = videoSource.src
    }
    return () => hls?.destroy()
  }, [videoSource?.src, videoSource?.type])

  // 事件监听：本地上报 + UI 状态；远端应用 + 房主重同步。
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const st = () => useRoomStore.getState()

    const applySnapshot = () => {
      const store = st()
      if (!store.videoSource?.src) return
      const { currentTime, playing, rate } = store.playback
      if (Number.isFinite(rate) && rate > 0) { suppressRef.current.rate = rate; video.playbackRate = rate }
      if (Number.isFinite(currentTime)) { suppressRef.current.seek = currentTime; video.currentTime = currentTime }
      suppressRef.current.play = playing
      if (playing) video.play?.().catch(() => {})
      else video.pause?.()
    }

    const applyRemote = (message) => {
      const store = st()
      if (message.ownerId === store.userName) return
      const data = message.data || {}
      // 房间快照（成员进出/在线状态/设置）不移动播放头，避免把正在观看的人拽回旧进度。
      if (message.type === SOCKET_TYPES.ROOM && data.type === ROOM_EVENTS.SNAPSHOT) return
      if (data.type === VIDEO_EVENTS.PLAYBACK || data.type === VIDEO_EVENTS.SYNC) {
        if (Number.isFinite(data.rate) && data.rate > 0) { suppressRef.current.rate = data.rate; video.playbackRate = data.rate }
        if (Number.isFinite(data.currentTime)) { suppressRef.current.seek = data.currentTime; video.currentTime = data.currentTime }
        suppressRef.current.play = data.play === 1
        if (data.play === 1) video.play?.().catch(() => {})
        else video.pause?.()
        store.applyPlaybackState?.(data.play === 1, data.currentTime, data.rate)
        return
      }
      if (data.type === VIDEO_EVENTS.SEEK && Number.isFinite(data.reach)) { suppressRef.current.seek = data.reach; video.currentTime = data.reach }
      if (data.type === VIDEO_EVENTS.RATE && Number.isFinite(data.rate) && data.rate > 0) { suppressRef.current.rate = data.rate; video.playbackRate = data.rate }
      if (data.type === VIDEO_EVENTS.HOLD) {
        if (Number.isFinite(data.rate) && data.rate > 0) { suppressRef.current.rate = data.rate; video.playbackRate = data.rate }
        if (data.active) {
          store.setHold(message.ownerId)
          clearTimeout(holdExpiryRef.current)
          holdExpiryRef.current = setTimeout(() => {
            // 心跳超时：快进的人可能掉线/切走，恢复常速并解锁。
            const s2 = st()
            const r = s2.playback.rate || 1
            suppressRef.current.rate = r
            if (videoRef.current) videoRef.current.playbackRate = r
            s2.setHold(null)
          }, HOLD_EXPIRY)
        } else {
          clearTimeout(holdExpiryRef.current)
          store.setHold(null)
        }
      }
    }

    // 任意在线成员均可响应“给新加入者同步进度”的请求（房主离线时补位）。
    const reportPlaybackTo = (requesterId) => {
      if (!requesterId) return
      socket.sendSync({ isPlaying: !video.paused, currentTime: video.currentTime || 0, rate: video.playbackRate || 1, targetId: requesterId })
    }

    const onPlay = () => {
      patch({ paused: false })
      pokeControls()
      const echo = suppressRef.current.play === true
      suppressRef.current.play = null
      if (echo) return
      const store = st()
      if (!store.videoSource?.src) return
      socket.send(createPlaybackMessage({ roomId: store.currentRoomId, ownerId: store.userName, isPlaying: true, currentTime: video.currentTime || 0, rate: video.playbackRate || 1 }))
    }
    const onPause = () => {
      patch({ paused: true, buffering: false })
      setControlsVisible(true)
      clearTimeout(controlsTimerRef.current)
      clearTimeout(bufferTimerRef.current)
      const echo = suppressRef.current.play === false
      suppressRef.current.play = null
      if (echo) return
      const store = st()
      if (!store.videoSource?.src) return
      socket.send(createPlaybackMessage({ roomId: store.currentRoomId, ownerId: store.userName, isPlaying: false, currentTime: video.currentTime || 0, rate: video.playbackRate || 1 }))
    }
    const onTime = () => patch({ currentTime: video.currentTime })
    const onDuration = () => patch({ duration: video.duration || 0 })
    const onLoaded = () => {
      patch({ duration: video.duration || 0 })
      if (!appliedRef.current) {
        appliedRef.current = true
        applySnapshot()
      }
    }
    const onSeeked = () => {
      const target = suppressRef.current.seek
      if (target != null && Math.abs((video.currentTime || 0) - target) < 0.8) {
        suppressRef.current.seek = null // 远端 seek 的回声，不再广播
        return
      }
      const store = st()
      if (!store.videoSource?.src) return
      const now = Date.now()
      if (now - seekTs.current < 400) return
      seekTs.current = now
      socket.send(createSeekMessage({ roomId: store.currentRoomId, ownerId: store.userName, currentTime: video.currentTime || 0 }))
    }
    const onRate = () => {
      patch({ rate: video.playbackRate })
      if (localRateRef.current) return // 手机长按 2 倍速为本地预览
      const target = suppressRef.current.rate
      if (target != null && Math.abs(video.playbackRate - target) < 0.01) {
        suppressRef.current.rate = null
        return
      }
      const store = st()
      if (!store.videoSource?.src) return
      store.setPlaybackRate(video.playbackRate)
      socket.sendRate(video.playbackRate)
    }
    const onVolume = () => patch({ volume: video.volume, muted: video.muted })
    const onProgress = () => {
      try {
        const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0
        patch({ buffered: end })
      } catch {
        // ignore
      }
    }
    const onFsChange = () => patch({ fullscreen: document.fullscreenElement === containerRef.current })
    const showBuffering = () => {
      clearTimeout(bufferTimerRef.current)
      bufferTimerRef.current = setTimeout(() => {
        const v = videoRef.current
        // 仅在“正在播放但没数据卡住了”才显示；暂停/已就绪不显示。
        if (v && !v.paused && v.readyState < 3) patch({ buffering: true })
      }, 300)
    }
    const hideBuffering = () => {
      clearTimeout(bufferTimerRef.current)
      patch({ buffering: false })
    }
    const onWaiting = showBuffering
    const onStalled = showBuffering
    const onCanPlay = hideBuffering
    const onPlaying = hideBuffering

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('durationchange', onDuration)
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('ratechange', onRate)
    video.addEventListener('volumechange', onVolume)
    video.addEventListener('progress', onProgress)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('playing', onPlaying)
    document.addEventListener('fullscreenchange', onFsChange)
    registerRemoteVideoHandler(applyRemote)
    registerResyncHandler(reportPlaybackTo)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('durationchange', onDuration)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('ratechange', onRate)
      video.removeEventListener('volumechange', onVolume)
      video.removeEventListener('progress', onProgress)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onPlaying)
      document.removeEventListener('fullscreenchange', onFsChange)
      registerRemoteVideoHandler(null)
      registerResyncHandler(null)
    }
  }, [])

  const actions = {
    togglePlay: () => { const v = videoRef.current; if (!v) return; v.paused ? v.play().catch(() => {}) : v.pause() },
    seek: (t) => { if (videoRef.current) videoRef.current.currentTime = t },
    setVolume: (v) => { const el = videoRef.current; if (!el) return; el.volume = v; el.muted = v === 0 },
    toggleMute: () => { const v = videoRef.current; if (v) v.muted = !v.muted },
    changeRate: (r) => { if (videoRef.current) videoRef.current.playbackRate = r },
    toggleFullscreen: () => {
      if (document.fullscreenElement) document.exitFullscreen?.()
      else containerRef.current?.requestFullscreen?.()
    },
  }

  // 电脑版：方向键控制（←/→ 快退快进 5s，↑/↓ 音量，空格播放/暂停，f 全屏，m 静音）。
  useEffect(() => {
    const onKey = (e) => {
      const s = useRoomStore.getState()
      if (!s.videoSource?.src) return
      if (s.holdBy && s.holdBy !== s.userName) return // 被他人快进锁定
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const v = videoRef.current
      if (!v) return
      pokeControls()
      const dur = v.duration || Infinity
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 5); break
        case 'ArrowRight': e.preventDefault(); v.currentTime = Math.min(dur, v.currentTime + 5); break
        case 'ArrowUp': e.preventDefault(); v.muted = false; v.volume = Math.min(1, v.volume + 0.05); break
        case 'ArrowDown': e.preventDefault(); v.volume = Math.max(0, v.volume - 0.05); break
        case ' ': case 'k': e.preventDefault(); actions.togglePlay(); break
        case 'f': e.preventDefault(); actions.toggleFullscreen(); break
        case 'm': e.preventDefault(); v.muted = !v.muted; break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 卸载时清理长按心跳/超时/控件计时；若正在快进则通知松手。
  useEffect(
    () => () => {
      if (holdBeatRef.current) {
        clearInterval(holdBeatRef.current)
        socket.sendHold(false, 1)
      }
      clearTimeout(holdExpiryRef.current)
      clearTimeout(controlsTimerRef.current)
      clearTimeout(bufferTimerRef.current)
    },
    [],
  )

  // 手机版手势：长按 2 倍速（广播 + 心跳）；长按后横向滑动拖动进度。
  const setLocalRate = (r) => {
    localRateRef.current = true
    if (videoRef.current) videoRef.current.playbackRate = r
    clearTimeout(gestureRef.current.rateTimer)
    gestureRef.current.rateTimer = setTimeout(() => { localRateRef.current = false }, 150)
  }
  const startHold = () => {
    socket.sendHold(true, 2)
    clearInterval(holdBeatRef.current)
    holdBeatRef.current = setInterval(() => socket.sendHold(true, 2), HOLD_BEAT)
  }
  const stopHold = (prevRate) => {
    if (!holdBeatRef.current) return
    clearInterval(holdBeatRef.current)
    holdBeatRef.current = null
    socket.sendHold(false, prevRate)
  }
  const gestures = {
    onTouchStart: (e) => {
      if (lockedByOther || e.touches.length !== 1) return
      const v = videoRef.current
      if (!v) return
      pokeControls()
      const g = gestureRef.current
      const t = e.touches[0]
      g.mode = null
      g.startX = t.clientX
      g.startY = t.clientY
      g.startTime = v.currentTime || 0
      g.t0 = Date.now()
      g.prevRate = v.playbackRate || 1
      clearTimeout(g.timer)
      g.timer = setTimeout(() => {
        if (g.mode || !videoRef.current) return
        g.mode = 'rate'
        setLocalRate(2)
        setHint({ type: 'rate' })
        startHold()
      }, 350)
    },
    onTouchMove: (e) => {
      if (lockedByOther) return
      const v = videoRef.current
      if (!v) return
      const g = gestureRef.current
      const t = e.touches[0]
      const dx = t.clientX - g.startX
      const dy = t.clientY - g.startY
      if (g.mode === 'rate' && Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) {
        stopHold(g.prevRate)
        setLocalRate(g.prevRate)
        g.mode = 'seek'
      }
      if (!g.mode && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy)) {
        clearTimeout(g.timer)
        g.mode = 'seek'
      }
      if (g.mode === 'seek') {
        e.preventDefault()
        const dur = v.duration || 0
        let target = g.startTime + dx * 0.25
        if (dur) target = Math.min(dur, target)
        target = Math.max(0, target)
        v.currentTime = target
        setHint({ type: 'seek', time: target, dur, delta: target - g.startTime })
      }
    },
    onTouchEnd: (e) => {
      const g = gestureRef.current
      clearTimeout(g.timer)
      if (g.mode === 'rate') {
        stopHold(g.prevRate)
        setLocalRate(g.prevRate)
      } else if (!g.mode && !lockedByOther) {
        const dt = Date.now() - g.t0
        const moved = Math.abs((e.changedTouches?.[0]?.clientX ?? g.startX) - g.startX) > 10
        if (dt < 300 && !moved) actions.togglePlay()
      }
      g.mode = null
      setHint(null)
    },
  }

  return (
    <section className="min-w-0">
      <div
        ref={containerRef}
        className="player-shell glass relative"
        style={{ borderRadius: 20, overflow: 'hidden', aspectRatio: '16 / 9', background: '#000' }}
        onMouseMove={hasSource ? pokeControls : undefined}
      >
        <video
          ref={videoRef}
          className="h-full w-full"
          playsInline
          crossOrigin="anonymous"
          preload="auto"
          style={{ objectFit: 'contain', background: '#000' }}
          onClick={isMobile || lockedByOther ? undefined : actions.togglePlay}
        />

        {hasSource && isMobile && (
          <div className="player-gesture" onTouchStart={gestures.onTouchStart} onTouchMove={gestures.onTouchMove} onTouchEnd={gestures.onTouchEnd} onTouchCancel={gestures.onTouchEnd} />
        )}

        <Danmaku active={ui.fullscreen} />

        {hasSource && ui.buffering && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
            <Loader2 className="animate-spin" size={46} style={{ color: '#fff', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }} />
          </div>
        )}

        <AnimatePresence>
          {fastLabel && (
            <motion.div
              key="fast-hint"
              className="absolute left-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5"
              style={{ bottom: 64, transform: 'translateX(-50%)', borderRadius: 999, color: '#fff', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <ChevronsRight size={16} /> <span className="text-sm font-bold">{fastLabel}</span>
            </motion.div>
          )}
          {hint?.type === 'seek' && (
            <motion.div
              key="seek-hint"
              className="glass-strong absolute left-1/2 top-1/2 z-20 flex flex-col items-center gap-0.5 px-4 py-2"
              style={{ transform: 'translate(-50%, -50%)', borderRadius: 14, color: '#fff' }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <span className="tabular-nums text-lg font-bold">{fmtTime(hint.time)}</span>
              <span className="tabular-nums text-xs" style={{ opacity: 0.8 }}>
                {hint.delta >= 0 ? '+' : '-'}{fmtTime(Math.abs(hint.delta))} / {fmtTime(hint.dur)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {hasSource && <ControlBar ui={ui} actions={actions} visible={controlsVisible} locked={lockedByOther} />}
        {!hasSource && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-content-center gap-2 text-center" style={{ color: '#e5e7eb' }}>
            <Film size={30} className="mx-auto opacity-70" />
            <strong className="text-lg">等待房主设置视频源</strong>
            <span className="text-sm" style={{ color: '#9ca3af' }}>在房间设置中添加视频源即可开始</span>
          </div>
        )}
      </div>
      <footer className="mt-2 flex justify-between px-1 text-xs text-muted">
        <RoomMeta />
      </footer>
    </section>
  )
}

function RoomMeta() {
  const currentRoomId = useRoomStore((s) => s.currentRoomId)
  const roomName = useRoomStore((s) => s.roomName)
  return <span>#{currentRoomId} · {roomName}</span>
}
