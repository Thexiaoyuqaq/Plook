export const SOCKET_TYPES = {
  ROOM: 1,
  VIDEO: 2,
  CHAT: 3,
  HEARTBEAT: 4,
}

export const ROOM_EVENTS = {
  ERROR: -1,
  LIST: 0,
  JOIN: 1,
  LEAVE: 2,
  CREATE: 3,
  SNAPSHOT: 4,
  LOCK_SOURCE: 5,
  UPDATE_SETTINGS: 6,
  DISBAND: 7,
  RESYNC_REQUEST: 8,
  PRESENCE: 9,
  PASSWORD_REQUIRED: 10,
}

export const VIDEO_EVENTS = {
  PLAYBACK: 0,
  SEEK: 1,
  SOURCE: 2,
  RATE: 3,
  SYNC: 4,
  HOLD: 5,
}

export const CHAT_EVENTS = { MESSAGE: 0 }

const now = () => Date.now()

export function createRoomJoinMessage({ roomId, ownerId, password = '' }) {
  return { type: SOCKET_TYPES.ROOM, data: { type: ROOM_EVENTS.JOIN, password }, roomId, ownerId, sentAt: now() }
}

export function createRoomCreateMessage({ ownerId, roomName, password = '', hidden = false }) {
  return {
    type: SOCKET_TYPES.ROOM,
    data: { type: ROOM_EVENTS.CREATE, roomName, password, hidden: Boolean(hidden) },
    roomId: null,
    ownerId,
    sentAt: now(),
  }
}

export function createRoomLockSourceMessage({ roomId, ownerId, locked }) {
  return { type: SOCKET_TYPES.ROOM, data: { type: ROOM_EVENTS.LOCK_SOURCE, locked: Boolean(locked) }, roomId, ownerId, sentAt: now() }
}

export function createRoomLeaveMessage({ roomId, ownerId }) {
  return { type: SOCKET_TYPES.ROOM, data: { type: ROOM_EVENTS.LEAVE }, roomId, ownerId, sentAt: now() }
}

export function createRoomDisbandMessage({ roomId, ownerId }) {
  return { type: SOCKET_TYPES.ROOM, data: { type: ROOM_EVENTS.DISBAND }, roomId, ownerId, sentAt: now() }
}

export function createRoomSettingsMessage({ roomId, ownerId, roomName, password = '', hidden = false }) {
  return {
    type: SOCKET_TYPES.ROOM,
    data: { type: ROOM_EVENTS.UPDATE_SETTINGS, roomName, password, hidden: Boolean(hidden) },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function createChatMessage({ roomId, ownerId, text }) {
  return { type: SOCKET_TYPES.CHAT, data: { type: CHAT_EVENTS.MESSAGE, msg: text }, roomId, ownerId, sentAt: now() }
}

// __APPEND__

export function createPlaybackMessage({ roomId, ownerId, isPlaying, currentTime, rate = 1 }) {
  return {
    type: SOCKET_TYPES.VIDEO,
    data: { type: VIDEO_EVENTS.PLAYBACK, play: isPlaying ? 1 : 0, currentTime, rate },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function createSeekMessage({ roomId, ownerId, currentTime }) {
  return { type: SOCKET_TYPES.VIDEO, data: { type: VIDEO_EVENTS.SEEK, reach: currentTime }, roomId, ownerId, sentAt: now() }
}

export function createRateMessage({ roomId, ownerId, rate }) {
  return { type: SOCKET_TYPES.VIDEO, data: { type: VIDEO_EVENTS.RATE, rate }, roomId, ownerId, sentAt: now() }
}

/** 长按快进（2x）开始/结束广播。 */
export function createHoldMessage({ roomId, ownerId, active, rate = 1 }) {
  return { type: SOCKET_TYPES.VIDEO, data: { type: VIDEO_EVENTS.HOLD, active: Boolean(active), rate }, roomId, ownerId, sentAt: now() }
}

/** 房主上报权威播放状态。带 targetId 时服务端只定向下发给该新加入成员。 */
export function createSyncMessage({ roomId, ownerId, isPlaying, currentTime, rate = 1, targetId = '' }) {
  return {
    type: SOCKET_TYPES.VIDEO,
    data: { type: VIDEO_EVENTS.SYNC, play: isPlaying ? 1 : 0, currentTime, rate, targetId },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function createSourceMessage({ roomId, ownerId, source }) {
  return {
    type: SOCKET_TYPES.VIDEO,
    data: { type: VIDEO_EVENTS.SOURCE, src: source.src, srcType: source.type },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function socketUrlForUser(userName, sid) {
  const encodedName = encodeURIComponent(userName)
  const query = sid ? `?sid=${encodeURIComponent(sid)}` : ''
  const configuredUrl = import.meta.env.VITE_WS_URL

  if (configuredUrl) {
    return `${configuredUrl.replace(/\/$/, '')}/websocket/${encodedName}${query}`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = import.meta.env.DEV ? 'localhost:1999' : window.location.host
  return `${protocol}//${host}/websocket/${encodedName}${query}`
}
