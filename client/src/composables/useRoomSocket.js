import { reactive } from 'vue'
import { toast } from 'vue-sonner'
import { useRoomStore } from '../stores/room'
import {
  ROOM_EVENTS,
  SOCKET_TYPES,
  VIDEO_EVENTS,
  createChatMessage,
  createRoomCreateMessage,
  createRoomJoinMessage,
  createRoomLockSourceMessage,
  createRoomSettingsMessage,
  createSourceMessage,
  socketUrlForUser,
} from '../utils/socketMessages'

const socketState = reactive({
  socket: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  manuallyClosed: false,
  heartbeatTimer: null,
})

let remoteVideoHandler = null

const ERROR_MESSAGES = {
  invalid_json: '收到无法解析的 WebSocket 消息',
  missing_type: '消息缺少类型',
  invalid_room_id: '房间号必须是 6 位数字',
  room_not_found: '房间不存在或已解散',
  room_password_invalid: '请输入房间密码',
  room_create_disabled: '当前服务器未开启创建房间',
  room_create_failed: '房间创建失败，请稍后重试',
  owner_required: '只有房主可以修改房间设置',
  source_locked: '视频源已锁定，只有房主可以修改',
  not_in_room: '你不在该房间内',
}

const PASSWORD_REQUIRED_ERRORS = new Set(['room_password_invalid'])

export function registerRemoteVideoHandler(handler) {
  remoteVideoHandler = handler

}

export function useRoomSocket() {
  const roomStore = useRoomStore()

  function connect(userName) {
    if (!userName) return
    if (socketState.socket?.readyState === WebSocket.OPEN) return

    socketState.manuallyClosed = false
    roomStore.setSocketStatus('connecting')

    const socket = new WebSocket(socketUrlForUser(userName))
    socketState.socket = socket

    socket.onopen = () => {
      socketState.reconnectAttempts = 0
      roomStore.setSocketStatus('open')
      startHeartbeat(roomStore)
    }

    socket.onerror = () => {
      roomStore.setSocketStatus('error', 'WebSocket 连接异常')
      toast.error('WebSocket 连接异常')
    }

    socket.onclose = () => {
      roomStore.setSocketStatus('closed')
      if (!socketState.manuallyClosed) {
        scheduleReconnect(userName)
      }
    }

    socket.onmessage = (event) => {
      handleSocketMessage(event.data)
    }
  }

  function disconnect() {
    socketState.manuallyClosed = true
    window.clearTimeout(socketState.reconnectTimer)
    window.clearInterval(socketState.heartbeatTimer)
    socketState.socket?.close()
    socketState.socket = null
    roomStore.setSocketStatus('closed')
    roomStore.resetRoomState()
  }

  function send(payload) {
    if (socketState.socket?.readyState !== WebSocket.OPEN) {
      toast.warning('WebSocket 未连接，消息未发送')
      return false
    }
    socketState.socket.send(JSON.stringify(payload))
    return true
  }

  function joinRoom({ roomId, password = '' }) {
    roomStore.clearRoomError()
    return send(createRoomJoinMessage({
      roomId,
      ownerId: roomStore.userName,
      password,
    }))
  }

  function createRoom({ roomName, password = '', hidden = false }) {
    roomStore.clearRoomError()
    return send(createRoomCreateMessage({
      ownerId: roomStore.userName,
      roomName,
      password,
      hidden,
    }))
  }

  function updateRoomSettings({ roomName, password = '', hidden = false }) {
    return send(createRoomSettingsMessage({
      roomId: roomStore.currentRoomId,
      ownerId: roomStore.userName,
      roomName,
      password,
      hidden,
    }))
  }

  function setSourceLocked(locked) {
    return send(createRoomLockSourceMessage({
      roomId: roomStore.currentRoomId,
      ownerId: roomStore.userName,
      locked,
    }))
  }

  function sendChat(text) {
    const trimmed = String(text || '').trim()
    if (!trimmed) return false

    const payload = createChatMessage({
      roomId: roomStore.currentRoomId,
      ownerId: roomStore.userName,
      text: trimmed,
    })

    if (send(payload)) {
      roomStore.appendMessage(toChatMessage(payload))
      return true
    }
    return false
  }

  function sendSource(source) {
    if (roomStore.sourceLocked && !roomStore.isRoomOwner) {
      toast.warning('视频源已锁定，只有房主可以修改')
      return false
    }

    return send(createSourceMessage({
      roomId: roomStore.currentRoomId,
      ownerId: roomStore.userName,
      source,
    }))
  }

  return {
    connect,
    disconnect,
    send,
    joinRoom,
    createRoom,
    updateRoomSettings,
    setSourceLocked,
    sendChat,
    sendSource,
  }
}

function scheduleReconnect(userName) {
  const roomStore = useRoomStore()
  window.clearTimeout(socketState.reconnectTimer)
  window.clearInterval(socketState.heartbeatTimer)
  const delay = Math.min(1000 * 2 ** socketState.reconnectAttempts, 15000)
  socketState.reconnectAttempts += 1
  socketState.reconnectTimer = window.setTimeout(() => {
    useRoomSocket().connect(userName)
  }, delay)
  roomStore.setSocketStatus('reconnecting', `${delay / 1000}s 后重连`)
}

function handleSocketMessage(raw) {
  const roomStore = useRoomStore()
  let message

  try {
    message = JSON.parse(raw)
  } catch {
    toast.error('收到无法解析的 WebSocket 消息')
    return
  }

  if (message.type === SOCKET_TYPES.ROOM) {
    handleRoomMessage(roomStore, message)
    return
  }

  if (message.type === SOCKET_TYPES.CHAT) {
    roomStore.appendMessage(toChatMessage(message))
    return
  }

  if (message.type === SOCKET_TYPES.VIDEO) {
    handleVideoMessage(roomStore, message)
  }
}

function handleRoomMessage(roomStore, message) {
  const eventType = message.data?.type

  if (eventType === ROOM_EVENTS.LIST) {
    roomStore.setRoomList(message.data.roomList)
    return
  }

  if (eventType === ROOM_EVENTS.SNAPSHOT) {
    roomStore.applyRoomSnapshot(message.data.room)
    remoteVideoHandler?.(message)
    return
  }

  if (eventType === ROOM_EVENTS.JOIN) {
    const actor = message.data?.actorId || message.ownerId
    roomStore.appendSystemMessage(`${actor} 进入房间`, actor)
    return
  }

  if (eventType === ROOM_EVENTS.LEAVE) {
    const actor = message.data?.actorId || message.ownerId
    roomStore.appendSystemMessage(`${actor} 离开房间`, actor)
    return
  }

  if (eventType === ROOM_EVENTS.LOCK_SOURCE) {
    const actor = message.data?.actorId || message.ownerId
    const code = message.data?.code
    roomStore.appendSystemMessage(code === 'source_locked' ? `${actor} 锁定视频源` : `${actor} 解锁视频源`, actor)
    return
  }

  if (eventType === ROOM_EVENTS.UPDATE_SETTINGS) {
    const actor = message.data?.actorId || message.ownerId
    roomStore.appendSystemMessage(`${actor} 更新了房间设置`, actor)
    return
  }

  if (eventType === ROOM_EVENTS.ERROR) {
    const code = message.data?.code || 'unknown_room_error'
    const messageText = ERROR_MESSAGES[code] || '房间消息错误'
    roomStore.setRoomError(code, messageText)
    if (!PASSWORD_REQUIRED_ERRORS.has(code)) {
      toast.error(messageText)
    }
  }
}

function startHeartbeat(roomStore) {
  window.clearInterval(socketState.heartbeatTimer)
  socketState.heartbeatTimer = window.setInterval(() => {
    if (socketState.socket?.readyState !== WebSocket.OPEN) return

    socketState.socket.send(JSON.stringify({
      type: SOCKET_TYPES.HEARTBEAT,
      data: { type: 0 },
      roomId: roomStore.currentRoomId,
      ownerId: roomStore.userName,
      sentAt: Date.now(),
    }))
  }, 25000)
}

function handleVideoMessage(roomStore, message) {
  const eventType = message.data?.type

  if (eventType === VIDEO_EVENTS.SOURCE) {
    roomStore.setVideoSource({
      src: message.data.src,
      type: message.data.srcType,
    })
  }

  remoteVideoHandler?.(message)
}

function toChatMessage(message) {
  return {
    type: 'chat',
    ownerId: message.ownerId,
    text: message.data?.msg || '',
    sentAt: message.sentAt || Date.now(),
  }
}
