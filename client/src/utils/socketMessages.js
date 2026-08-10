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
}

export const VIDEO_EVENTS = {
  PLAYBACK: 0,
  SEEK: 1,
  SOURCE: 2,
}

export const CHAT_EVENTS = {
  MESSAGE: 0,
}

const now = () => Date.now()

export function createRoomJoinMessage({ roomId, ownerId, password = '' }) {
  return {
    type: SOCKET_TYPES.ROOM,
    data: {
      type: ROOM_EVENTS.JOIN,
      password,
    },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function createRoomCreateMessage({ ownerId, roomName, password = '', hidden = false }) {
  return {
    type: SOCKET_TYPES.ROOM,
    data: {
      type: ROOM_EVENTS.CREATE,
      roomName,
      password,
      hidden: Boolean(hidden),
    },
    roomId: null,
    ownerId,
    sentAt: now(),
  }
}

export function createRoomLockSourceMessage({ roomId, ownerId, locked }) {
  return {
    type: SOCKET_TYPES.ROOM,
    data: {
      type: ROOM_EVENTS.LOCK_SOURCE,
      locked: Boolean(locked),
    },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function createRoomSettingsMessage({ roomId, ownerId, roomName, password = '', hidden = false }) {
  return {
    type: SOCKET_TYPES.ROOM,
    data: {
      type: ROOM_EVENTS.UPDATE_SETTINGS,
      roomName,
      password,
      hidden: Boolean(hidden),
    },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function createChatMessage({ roomId, ownerId, text }) {
  return {
    type: SOCKET_TYPES.CHAT,
    data: {
      type: CHAT_EVENTS.MESSAGE,
      msg: text,
    },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function createPlaybackMessage({ roomId, ownerId, isPlaying, currentTime }) {
  return {
    type: SOCKET_TYPES.VIDEO,
    data: {
      type: VIDEO_EVENTS.PLAYBACK,
      play: isPlaying ? 1 : 0,
      currentTime,
    },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function createSeekMessage({ roomId, ownerId, currentTime }) {
  return {
    type: SOCKET_TYPES.VIDEO,
    data: {
      type: VIDEO_EVENTS.SEEK,
      reach: currentTime,
    },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function createSourceMessage({ roomId, ownerId, source }) {
  return {
    type: SOCKET_TYPES.VIDEO,
    data: {
      type: VIDEO_EVENTS.SOURCE,
      src: source.src,
      srcType: source.type,
    },
    roomId,
    ownerId,
    sentAt: now(),
  }
}

export function socketUrlForUser(userName) {
  const encodedName = encodeURIComponent(userName)
  const configuredUrl = import.meta.env.VITE_WS_URL

  if (configuredUrl) {
    return `${configuredUrl.replace(/\/$/, '')}/websocket/${encodedName}`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = import.meta.env.DEV ? 'localhost:1999' : window.location.host
  return `${protocol}//${host}/websocket/${encodedName}`
}
