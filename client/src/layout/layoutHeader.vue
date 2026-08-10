<template>
  <header class="app-header">
    <div class="brand">
      <img src="../assets/favicon.svg" alt="Plook" />
      <div>
        <strong>Plook</strong>
        <span>{{ headerSubtitle }}</span>
      </div>
    </div>

    <div class="header-actions">
      <span class="status-pill" :class="`is-${statusKind}`">{{ statusText }}</span>
      <button class="ghost-button" type="button" :disabled="!roomStore.currentRoomId" @click="roomStore.openRoomSettings">
        房间设置
      </button>
      <button class="primary-button" type="button" @click="logout">退出</button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRoomStore } from '../stores/room'
import { useRoomSocket } from '../composables/useRoomSocket'
import { clearSavedUserName } from '../utils/session'

const router = useRouter()
const roomStore = useRoomStore()
const socket = useRoomSocket()

const headerSubtitle = computed(() => {
  if (!roomStore.currentRoomId) return '选择或创建放映房间'
  const ownerText = roomStore.isRoomOwner ? '你是房主' : `房主 ${roomStore.ownerId || '未知'}`
  const roomMode = roomStore.hidden ? '私密房间' : '公开房间'
  const passwordText = roomStore.hasPassword ? '有密码' : '无密码'
  return `#${roomStore.currentRoomId} · ${roomStore.roomName} · ${ownerText} · ${roomMode} · ${passwordText}`
})

const statusText = computed(() => {
  const map = {
    idle: '未连接',
    connecting: '连接中',
    open: '已连接',
    closed: '已断开',
    reconnecting: '重连中',
    error: '异常',
  }
  return map[roomStore.socketStatus] || roomStore.socketStatus
})

const statusKind = computed(() => {
  if (roomStore.socketStatus === 'open') return 'success'
  if (roomStore.socketStatus === 'connecting' || roomStore.socketStatus === 'reconnecting') return 'warning'
  return 'danger'
})

function logout() {
  clearSavedUserName()
  socket.disconnect()
  roomStore.setUserName('')
  router.push({ name: 'login' })
}
</script>

<style scoped>
.app-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
}

.brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand img {
  width: 36px;
  height: 36px;
}

.brand strong,
.brand span {
  display: block;
}

.brand strong {
  color: #1f2937;
  font-size: 16px;
}

.brand span {
  max-width: min(56vw, 620px);
  overflow: hidden;
  color: #667085;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-pill {
  padding: 4px 8px;
  border: 1px solid #d8dee8;
  border-radius: 999px;
  font-size: 12px;
}

.status-pill.is-success {
  border-color: #9ad5a5;
  background: #f0faf2;
  color: #237a37;
}

.status-pill.is-warning {
  border-color: #f0cf7a;
  background: #fff8e5;
  color: #8a5a00;
}

.status-pill.is-danger {
  border-color: #f2aaa4;
  background: #fff1f0;
  color: #a33127;
}

.ghost-button,
.primary-button {
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  cursor: pointer;
}

.ghost-button {
  border: 1px solid #cfd7e3;
  background: #fff;
  color: #1f2937;
}

.ghost-button:disabled {
  color: #98a2b3;
  cursor: not-allowed;
}

.primary-button {
  border: 0;
  background: #2563eb;
  color: #fff;
}

@media (max-width: 640px) {
  .status-pill {
    display: none;
  }
}
</style>
