const USERNAME_KEY = 'plook_username'
const SID_KEY = 'plook_sid'
const LAST_ROOM_KEY = 'plook_last_room'

export function getSavedUserName() {
  return window.localStorage.getItem(USERNAME_KEY) || ''
}

export function saveUserName(userName) {
  window.localStorage.setItem(USERNAME_KEY, userName)
}

export function clearSavedUserName() {
  window.localStorage.removeItem(USERNAME_KEY)
}

/**
 * 返回本浏览器持久化的会话 ID（sid）。服务端据此在刷新/重连后识别同一客户端，
 * 从而在宽限期内无需重新验证房间密码即可恢复会话。
 */
export function getSessionId() {
  let sid = window.localStorage.getItem(SID_KEY)
  if (!sid) {
    sid = generateId()
    window.localStorage.setItem(SID_KEY, sid)
  }
  return sid
}

export function getLastRoomId() {
  return window.localStorage.getItem(LAST_ROOM_KEY) || ''
}

export function saveLastRoomId(roomId) {
  if (roomId) {
    window.localStorage.setItem(LAST_ROOM_KEY, roomId)
  } else {
    window.localStorage.removeItem(LAST_ROOM_KEY)
  }
}

function generateId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `sid-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}
