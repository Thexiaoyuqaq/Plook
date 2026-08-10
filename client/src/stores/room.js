import { defineStore } from 'pinia'

const EMPTY_PLAYBACK = {
  playing: false,
  currentTime: 0,
  updatedAt: 0,
}

export const useRoomStore = defineStore('room', {
  state: () => ({
    userName: '',
    socketStatus: 'idle',
    socketError: '',
    roomError: null,
    roomErrorSeq: 0,
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
    isRoomSettingsOpen: false,
    remoteVideoLockUntil: 0,
  }),

  getters: {
    isConnected: (state) => state.socketStatus === 'open',
    canEnterRoom: (state) => Boolean(state.userName && state.currentRoomId),
    isRoomOwner: (state) => Boolean(state.currentRoomId && state.ownerId && state.ownerId === state.userName),
    hasVideoSource: (state) => Boolean(state.videoSource?.src),
  },

  actions: {
    setUserName(userName) {
      this.userName = String(userName || '').trim()
    },
    setSocketStatus(status, error = '') {
      this.socketStatus = status
      this.socketError = error
    },
    setRoomError(code, message = '') {
      this.roomError = {
        code,
        message,
        at: Date.now(),
      }
      this.roomErrorSeq += 1
    },
    clearRoomError() {
      this.roomError = null
    },
    setRoomList(roomList) {
      if (!Array.isArray(roomList)) {
        this.roomList = []
        return
      }

      this.roomList = roomList
        .map(normalizeRoomSummary)
        .filter((room) => room.roomId)
        .sort((left, right) => left.roomName.localeCompare(right.roomName))
    },
    applyRoomSnapshot(room) {
      if (!room?.roomId) return

      this.clearRoomError()
      const previousRoomId = this.currentRoomId
      this.currentRoomId = room.roomId
      this.roomName = room.roomName || room.roomId
      this.ownerId = room.ownerId || ''
      this.members = Array.isArray(room.members) ? [...room.members].sort() : []
      this.sourceLocked = Boolean(room.sourceLocked)
      this.hidden = Boolean(room.hidden)
      this.hasPassword = Boolean(room.hasPassword)
      this.videoSource = normalizeVideoSource(room.videoSource)
      this.playback = normalizePlayback(room.playback)

      if (previousRoomId && previousRoomId !== room.roomId) {
        this.messages = []
      }
    },
    appendMessage(message) {
      this.messages.push({
        id: message.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...message,
      })
    },
    appendSystemMessage(text, ownerId = 'system') {
      this.appendMessage({
        type: 'system',
        ownerId,
        text,
        sentAt: Date.now(),
      })
    },
    setVideoSource(source) {
      this.videoSource = normalizeVideoSource(source)
    },
    setSourceLocked(locked) {
      this.sourceLocked = Boolean(locked)
    },
    openRoomSettings() {
      this.isRoomSettingsOpen = true
    },
    closeRoomSettings() {
      this.isRoomSettingsOpen = false
    },
    markRemoteVideoEvent(duration = 600) {
      this.remoteVideoLockUntil = Date.now() + duration
    },
    isApplyingRemoteVideoEvent() {
      return Date.now() < this.remoteVideoLockUntil
    },
    resetRoomState() {
      this.currentRoomId = ''
      this.roomName = ''
      this.ownerId = ''
      this.members = []
      this.messages = []
      this.videoSource = null
      this.playback = { ...EMPTY_PLAYBACK }
      this.sourceLocked = false
      this.hidden = false
      this.hasPassword = false
      this.isRoomSettingsOpen = false
      this.clearRoomError()
      this.remoteVideoLockUntil = 0
    },
  },
})

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

function normalizeVideoSource(source) {
  if (!source?.src) return null
  return {
    src: String(source.src).trim(),
    type: source.type || 'video/mp4',
  }
}

function normalizePlayback(playback) {
  if (!playback) return { ...EMPTY_PLAYBACK }
  return {
    playing: Boolean(playback.playing),
    currentTime: Number(playback.currentTime || 0),
    updatedAt: Number(playback.updatedAt || 0),
  }
}
