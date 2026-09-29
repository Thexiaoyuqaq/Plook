import { toast } from 'sonner'
import { useRoomStore } from '../store/roomStore'
import {
  ROOM_EVENTS,
  SOCKET_TYPES,
  VIDEO_EVENTS,
  createChatMessage,
  createRateMessage,
  createHoldMessage,
  createRoomCreateMessage,
  createRoomDisbandMessage,
  createRoomJoinMessage,
  createRoomLeaveMessage,
  createRoomLockSourceMessage,
  createRoomSettingsMessage,
  createSourceMessage,
  createSyncMessage,
  socketUrlForUser,
} from './socketMessages'
import { getSessionId, saveLastRoomId } from './session'

const HEARTBEAT_INTERVAL = 20000
const MAX_RECONNECT_DELAY = 15000

const state = {
  socket: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  manuallyClosed: false,
  heartbeatTimer: null,
  userName: '',
  listenersInstalled: false,
  wasDisconnected: false,
}

let remoteVideoHandler = null
let resyncHandler = null

const ERROR_MESSAGES = {
  invalid_json: '收到无法解析的消息',
  missing_type: '消息缺少类型',
  missing_room: '缺少房间信息',
  invalid_room_id: '房间号必须是 6 位数字',
  room_not_found: '房间不存在或已解散',
  room_password_invalid: '房间密码错误',
  room_create_disabled: '当前服务器未开启创建房间',
  room_create_failed: '房间创建失败，请稍后重试',
  owner_required: '只有房主可以执行该操作',
  source_locked: '视频源已锁定，只有房主可以修改',
  not_in_room: '你不在该房间内',
  room_empty: '房间没有其他成员',
}

const store = () => useRoomStore.getState()

export function registerRemoteVideoHandler(handler) {
  remoteVideoHandler = handler
}
/** 房主注册：新成员加入时，服务端请求房主上报当前权威播放进度。 */
export function registerResyncHandler(handler) {
  resyncHandler = handler
}

export function connect(userName) {
  const name = String(userName || state.userName || '').trim()
  if (!name) return
  state.userName = name

  const readyState = state.socket?.readyState
  if (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) return

  state.manuallyClosed = false
  store().setSocketStatus('connecting')

  const ws = new WebSocket(socketUrlForUser(name, getSessionId()))
  state.socket = ws

  ws.onopen = () => {
    state.reconnectAttempts = 0
    store().setSocketStatus('open')
    startHeartbeat()
    if (state.wasDisconnected) {
      state.wasDisconnected = false
      toast.success('已重新连接')
    }
  }
  ws.onerror = () => store().setSocketStatus('error', 'WebSocket 连接异常')
  ws.onclose = () => {
    stopHeartbeat()
    store().setSocketStatus('closed')
    if (!state.manuallyClosed) {
      state.wasDisconnected = true
      scheduleReconnect()
    }
  }
  ws.onmessage = (event) => handleSocketMessage(event.data)
}

export function ensureConnected(userName) {
  installGlobalListeners()
  connect(userName)
}

export function disconnect() {
  state.manuallyClosed = true
  window.clearTimeout(state.reconnectTimer)
  stopHeartbeat()
  try {
    state.socket?.close()
  } catch {
    // ignore
  }
  state.socket = null
  state.userName = ''
  state.reconnectAttempts = 0
  store().setSocketStatus('closed')
  store().resetRoomState()
  saveLastRoomId('')
}

function send(payload) {
  if (state.socket?.readyState !== WebSocket.OPEN) {
    toast.warning('连接已断开，正在重连…')
    reconnectNow()
    return false
  }
  state.socket.send(JSON.stringify(payload))
  return true
}

// __APPEND__

export const socket = {
  connect,
  ensureConnected,
  disconnect,
  send,
  joinRoom({ roomId, password = '' }) {
    store().clearRoomError()
    return send(createRoomJoinMessage({ roomId, ownerId: store().userName, password }))
  },
  createRoom({ roomName, password = '', hidden = false }) {
    store().clearRoomError()
    return send(createRoomCreateMessage({ ownerId: store().userName, roomName, password, hidden }))
  },
  updateRoomSettings({ roomName, password = '', hidden = false }) {
    return send(createRoomSettingsMessage({ roomId: store().currentRoomId, ownerId: store().userName, roomName, password, hidden }))
  },
  setSourceLocked(locked) {
    return send(createRoomLockSourceMessage({ roomId: store().currentRoomId, ownerId: store().userName, locked }))
  },
  leaveRoom() {
    const roomId = store().currentRoomId
    if (roomId) send(createRoomLeaveMessage({ roomId, ownerId: store().userName }))
    store().resetRoomState()
    saveLastRoomId('')
  },
  disbandRoom() {
    if (store().ownerId !== store().userName) return false
    return send(createRoomDisbandMessage({ roomId: store().currentRoomId, ownerId: store().userName }))
  },
  sendChat(text) {
    const trimmed = String(text || '').trim()
    if (!trimmed) return false
    const payload = createChatMessage({ roomId: store().currentRoomId, ownerId: store().userName, text: trimmed })
    if (send(payload)) {
      store().appendMessage(toChatMessage(payload))
      return true
    }
    return false
  },
  sendSource(source) {
    if (store().sourceLocked && store().ownerId !== store().userName) {
      toast.warning('视频源已锁定，只有房主可以修改')
      return false
    }
    return send(createSourceMessage({ roomId: store().currentRoomId, ownerId: store().userName, source }))
  },
  sendRate(rate) {
    return send(createRateMessage({ roomId: store().currentRoomId, ownerId: store().userName, rate }))
  },
  sendHold(active, rate) {
    return send(createHoldMessage({ roomId: store().currentRoomId, ownerId: store().userName, active, rate }))
  },
  sendSync({ isPlaying, currentTime, rate, targetId = '' }) {
    return send(createSyncMessage({ roomId: store().currentRoomId, ownerId: store().userName, isPlaying, currentTime, rate, targetId }))
  },
}

// __APPEND2__

function installGlobalListeners() {
  if (state.listenersInstalled || typeof window === 'undefined') return
  state.listenersInstalled = true

  const wake = () => {
    if (state.manuallyClosed || !state.userName) return
    if (state.socket?.readyState === WebSocket.OPEN) sendHeartbeat()
    else reconnectNow()
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake()
  })
  window.addEventListener('online', wake)
  window.addEventListener('focus', wake)
  window.addEventListener('pageshow', wake)
}

function reconnectNow() {
  if (state.manuallyClosed || !state.userName) return
  window.clearTimeout(state.reconnectTimer)
  state.reconnectAttempts = 0
  const readyState = state.socket?.readyState
  if (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) return
  connect(state.userName)
}

function scheduleReconnect() {
  window.clearTimeout(state.reconnectTimer)
  const delay = Math.min(1000 * 2 ** state.reconnectAttempts, MAX_RECONNECT_DELAY)
  state.reconnectAttempts += 1
  state.reconnectTimer = window.setTimeout(() => connect(state.userName), delay)
  store().setSocketStatus('reconnecting', `${Math.round(delay / 1000)}s 后重连`)
}

function startHeartbeat() {
  stopHeartbeat()
  state.heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)
}
function stopHeartbeat() {
  window.clearInterval(state.heartbeatTimer)
  state.heartbeatTimer = null
}
function sendHeartbeat() {
  if (state.socket?.readyState !== WebSocket.OPEN) return
  const s = store()
  state.socket.send(JSON.stringify({ type: SOCKET_TYPES.HEARTBEAT, data: { type: 0 }, roomId: s.currentRoomId, ownerId: s.userName, sentAt: Date.now() }))
}

// __APPEND3__

function handleSocketMessage(raw) {
  let message
  try {
    message = JSON.parse(raw)
  } catch {
    toast.error('收到无法解析的消息')
    return
  }
  if (message.type === SOCKET_TYPES.ROOM) return handleRoomMessage(message)
  if (message.type === SOCKET_TYPES.CHAT) return store().appendMessage(toChatMessage(message))
  if (message.type === SOCKET_TYPES.VIDEO) return handleVideoMessage(message)
}

function handleRoomMessage(message) {
  const s = store()
  const data = message.data || {}
  const actor = data.actorId || message.ownerId

  switch (data.type) {
    case ROOM_EVENTS.LIST:
      return s.setRoomList(data.roomList)
    case ROOM_EVENTS.SNAPSHOT:
      s.applyRoomSnapshot(data.room)
      saveLastRoomId(store().currentRoomId)
      return remoteVideoHandler?.(message)
    case ROOM_EVENTS.DISBAND:
      toast('房主已解散房间')
      return s.handleDisband()
    case ROOM_EVENTS.RESYNC_REQUEST:
      return resyncHandler?.(data.requesterId)
    case ROOM_EVENTS.PASSWORD_REQUIRED:
      return s.requestPassword(data.roomId || message.roomId)
    case ROOM_EVENTS.JOIN:
    case ROOM_EVENTS.LEAVE:
    case ROOM_EVENTS.LOCK_SOURCE:
    case ROOM_EVENTS.UPDATE_SETTINGS:
      return s.appendSystemMessage(data.text || fallbackSystemText(data.type, actor), actor)
    case ROOM_EVENTS.ERROR: {
      const code = data.code || 'unknown_room_error'
      // 断线宽限期过后被移出房间：静默重新加入，恢复会话（无密码房自动，密码房会触发密码框）。
      if (code === 'not_in_room' && s.currentRoomId) {
        socket.joinRoom({ roomId: s.currentRoomId })
        return
      }
      const text = ERROR_MESSAGES[code] || '房间消息错误'
      s.setRoomError(code, text)
      toast.error(text)
      return
    }
    default:
      return
  }
}

function handleVideoMessage(message) {
  const data = message.data || {}
  if (data.type === VIDEO_EVENTS.SOURCE) store().setVideoSource({ src: data.src, type: data.srcType })
  if (data.type === VIDEO_EVENTS.RATE && Number.isFinite(data.rate)) store().setPlaybackRate(data.rate)
  remoteVideoHandler?.(message)
}

function fallbackSystemText(eventType, actor) {
  switch (eventType) {
    case ROOM_EVENTS.JOIN:
      return `${actor} 进入房间`
    case ROOM_EVENTS.LEAVE:
      return `${actor} 离开房间`
    case ROOM_EVENTS.LOCK_SOURCE:
      return `${actor} 更新了视频源锁定`
    case ROOM_EVENTS.UPDATE_SETTINGS:
      return `${actor} 更新了房间设置`
    default:
      return ''
  }
}

function toChatMessage(message) {
  return { type: 'chat', ownerId: message.ownerId, text: message.data?.msg || '', sentAt: message.sentAt || Date.now() }
}


