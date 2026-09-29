import { create } from 'zustand'

const EMPTY_PLAYBACK = { playing: false, currentTime: 0, rate: 1, updatedAt: 0 }

export const useRoomStore = create((set, get) => ({
  userName: '',
  socketStatus: 'idle',
  socketError: '',
  roomError: null,
  roomErrorSeq: 0,
  passwordPrompt: null,
  passwordPromptSeq: 0,
  disbandSeq: 0,
  roomList: [],
  currentRoomId: '',
  roomName: '',
  ownerId: '',
  members: [],
  messages: [],
  videoSource: null,
  playback: { ...EMPTY_PLAYBACK },
  sourceLocked: false,
  hidden: false,
  hasPassword: false,
  settingsOpen: false,
  remoteVideoLockUntil: 0,
  holdBy: null,

  setUserName: (userName) => set({ userName: String(userName || '').trim() }),
  setSocketStatus: (status, error = '') => set({ socketStatus: status, socketError: error }),

  setRoomError: (code, message = '') =>
    set((s) => ({ roomError: { code, message, at: Date.now() }, roomErrorSeq: s.roomErrorSeq + 1 })),
  clearRoomError: () => set({ roomError: null }),

  requestPassword: (roomId) =>
    set((s) => ({ passwordPrompt: { roomId, at: Date.now() }, passwordPromptSeq: s.passwordPromptSeq + 1 })),
  clearPasswordPrompt: () => set({ passwordPrompt: null }),

  setRoomList: (roomList) => {
    if (!Array.isArray(roomList)) return set({ roomList: [] })
    set({
      roomList: roomList
        .map(normalizeRoomSummary)
        .filter((room) => room.roomId)
        .sort((a, b) => a.roomName.localeCompare(b.roomName)),
    })
  },

  applyRoomSnapshot: (room) => {
    if (!room?.roomId) return
    const previousRoomId = get().currentRoomId
    const next = {
      roomError: null,
      passwordPrompt: null,
      currentRoomId: room.roomId,
      roomName: room.roomName || room.roomId,
      ownerId: room.ownerId || '',
      members: normalizeMembers(room.members),
      sourceLocked: Boolean(room.sourceLocked),
      hidden: Boolean(room.hidden),
      hasPassword: Boolean(room.hasPassword),
      videoSource: normalizeVideoSource(room.videoSource),
      playback: normalizePlayback(room.playback),
    }
    if (Array.isArray(room.history)) {
      next.messages = room.history.map(normalizeHistoryEntry)
    } else if (previousRoomId && previousRoomId !== room.roomId) {
      next.messages = []
    }
    set(next)
  },

  appendMessage: (message) =>
    set((s) => ({
      messages: [...s.messages, { id: message.id || randomId(), ...message }],
    })),
  appendSystemMessage: (text, ownerId = 'system') =>
    get().appendMessage({ type: 'system', ownerId, text, sentAt: Date.now() }),

  setVideoSource: (source) => set({ videoSource: normalizeVideoSource(source) }),
  setSourceLocked: (locked) => set({ sourceLocked: Boolean(locked) }),
  setPlaybackRate: (rate) => set((s) => ({ playback: { ...s.playback, rate: normalizeRate(rate) } })),
  applyPlaybackState: (playing, currentTime, rate) =>
    set((s) => ({
      playback: {
        playing: Boolean(playing),
        currentTime: Number.isFinite(currentTime) ? Number(currentTime) : s.playback.currentTime,
        rate: normalizeRate(rate),
        updatedAt: Date.now(),
      },
    })),

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  markRemoteVideoEvent: (duration = 900) => set({ remoteVideoLockUntil: Date.now() + duration }),
  isApplyingRemoteVideoEvent: () => Date.now() < get().remoteVideoLockUntil,
  setHold: (holdBy) => set({ holdBy: holdBy || null }),

  handleDisband: () => {
    get().appendSystemMessage('房主已解散房间')
    set((s) => ({ disbandSeq: s.disbandSeq + 1 }))
    get().resetRoomState()
  },

  resetRoomState: () =>
    set({
      currentRoomId: '',
      roomName: '',
      ownerId: '',
      members: [],
      messages: [],
      videoSource: null,
      playback: { ...EMPTY_PLAYBACK },
      sourceLocked: false,
      hidden: false,
      hasPassword: false,
      settingsOpen: false,
      roomError: null,
      passwordPrompt: null,
      remoteVideoLockUntil: 0,
      holdBy: null,
    }),
}))

// 选择器 / 派生状态
export const selectIsConnected = (s) => s.socketStatus === 'open'
export const selectIsRoomOwner = (s) => Boolean(s.currentRoomId && s.ownerId && s.ownerId === s.userName)
export const selectHasVideoSource = (s) => Boolean(s.videoSource?.src)
export const selectOnlineCount = (s) => s.members.filter((m) => m.online).length
export const selectPlaybackRate = (s) => s.playback.rate || 1

// __APPEND__

function randomId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeRoomSummary(room) {
  return {
    roomId: String(room?.roomId || '').trim(),
    roomName: String(room?.roomName || room?.roomId || '').trim(),
    ownerId: String(room?.ownerId || '').trim(),
    memberCount: Number(room?.memberCount || 0),
    sourceLocked: Boolean(room?.sourceLocked),
    hidden: Boolean(room?.hidden),
    hasPassword: Boolean(room?.hasPassword),
    emptySince: room?.emptySince ?? null,
    createdAt: Number(room?.createdAt || 0),
  }
}

function normalizeMembers(members) {
  if (!Array.isArray(members)) return []
  return members
    .map((member) =>
      typeof member === 'string'
        ? { name: member, online: true, owner: false }
        : { name: String(member?.name || '').trim(), online: member?.online !== false, owner: Boolean(member?.owner) },
    )
    .filter((m) => m.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function normalizeHistoryEntry(entry) {
  return {
    id: entry?.id || randomId(),
    type: entry?.kind === 'system' ? 'system' : 'chat',
    ownerId: entry?.ownerId || 'system',
    text: entry?.text || '',
    sentAt: Number(entry?.sentAt || Date.now()),
  }
}

function normalizeVideoSource(source) {
  if (!source?.src) return null
  return { src: String(source.src).trim(), type: source.type || 'video/mp4' }
}

function normalizePlayback(playback) {
  if (!playback) return { ...EMPTY_PLAYBACK }
  return {
    playing: Boolean(playback.playing),
    currentTime: Number(playback.currentTime || 0),
    rate: normalizeRate(playback.rate),
    updatedAt: Number(playback.updatedAt || 0),
  }
}

function normalizeRate(rate) {
  const value = Number(rate)
  return Number.isFinite(value) && value > 0 ? value : 1
}
