<template>
  <section class="room-select-page">
    <div class="room-select-panel">
      <header class="panel-header">
        <div>
          <h2>选择放映房间</h2>
          <p>{{ roomStore.roomList.length }} 个公开房间在线，私密房间需要手动输入房间号</p>
        </div>
        <span class="status-pill" :class="`is-${statusKind}`">{{ statusText }}</span>
      </header>

      <form class="join-room-form" @submit.prevent="joinRoom">
        <label>
          <span>房间号</span>
          <input
            v-model="joinDraft.roomId"
            class="text-input"
            inputmode="numeric"
            maxlength="6"
            placeholder="输入 6 位数字房间号"
          />
        </label>
        <button class="primary-button" type="submit" :disabled="!canJoin">
          加入房间
        </button>
      </form>

      <div class="create-row">
        <p>没有房间时可以创建一个新的放映房间，系统会自动生成 6 位房间号。</p>
        <button class="ghost-button" type="button" :disabled="!roomStore.isConnected" @click="openCreateModal">
          创建房间
        </button>
      </div>

      <p v-if="roomStore.roomList.length === 0" class="empty-state">
        暂无公开房间。私密房间不会显示在列表中，请输入房间号加入。
      </p>

      <div v-else class="room-grid">
        <button
          v-for="room in roomStore.roomList"
          :key="room.roomId"
          class="room-option"
          :class="{ 'is-selected': joinDraft.roomId === room.roomId }"
          type="button"
          @click="selectRoom(room)"
        >
          <strong>{{ room.roomName }}</strong>
          <span>#{{ room.roomId }} · 房主 {{ room.ownerId || '未知' }}</span>
          <small>{{ room.memberCount }} 人在线 · {{ room.hasPassword ? '需要密码' : '无密码' }}</small>
        </button>
      </div>
    </div>

    <div v-if="isCreateModalOpen" class="modal-backdrop" @click.self="closeCreateModal">
      <section class="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-room-title">
        <header class="modal-header">
          <div>
            <h2 id="create-room-title">创建房间</h2>
            <p>填写房间名，可选择密码和是否隐藏到私密房间。</p>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" @click="closeCreateModal">x</button>
        </header>

        <form class="modal-form" @submit.prevent="createRoom">
          <label>
            <span>房间名</span>
            <input
              v-model="createDraft.roomName"
              class="text-input"
              maxlength="30"
              placeholder="例如 周末放映厅"
              autofocus
            />
          </label>

          <label>
            <span>房间密码</span>
            <input
              v-model="createDraft.password"
              class="text-input"
              maxlength="40"
              placeholder="可选，不填则无密码"
              type="password"
            />
          </label>

          <label class="toggle-row">
            <input v-model="createDraft.hidden" type="checkbox" />
            <span>隐藏房间，不显示在公开房间列表</span>
          </label>

          <button class="primary-button" type="submit" :disabled="!canCreate">
            确认创建
          </button>
        </form>
      </section>
    </div>

    <div v-if="isJoinModalOpen" class="modal-backdrop" @click.self="closeJoinModal">
      <section class="create-modal" role="dialog" aria-modal="true" aria-labelledby="join-room-title">
        <header class="modal-header">
          <div>
            <h2 id="join-room-title">加入房间</h2>
            <p>房间号 #{{ joinModal.roomId }}{{ joinModalNeedsPassword ? ' 需要密码' : '' }}</p>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" @click="closeJoinModal">x</button>
        </header>

        <form class="modal-form" @submit.prevent="confirmJoinRoom">
          <label>
            <span>房间密码</span>
            <input
              v-model="joinModal.password"
              class="text-input"
              maxlength="40"
              type="password"
              :placeholder="joinModalNeedsPassword ? '请输入房间密码' : '如果房间有密码，请在这里填写'"
            />
          </label>

          <p v-if="joinModalError" class="form-error">{{ joinModalError }}</p>

          <button class="primary-button" type="submit" :disabled="!canConfirmJoin">
            直接加入房间
          </button>
        </form>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useRoomStore } from '../stores/room'

const emit = defineEmits(['join-room', 'create-room'])
const roomStore = useRoomStore()
const isCreateModalOpen = ref(false)
const isJoinModalOpen = ref(false)
const joinDraft = reactive({
  roomId: '',
})
const joinModal = reactive({
  roomId: '',
  password: '',
})
const createDraft = reactive({
  roomName: '',
  password: '',
  hidden: false,
})

const canJoin = computed(() => /^\d{6}$/.test(joinDraft.roomId) && roomStore.isConnected)
const canCreate = computed(() => Boolean(createDraft.roomName.trim() && roomStore.isConnected))
const joinModalNeedsPassword = computed(() => Boolean(findRoom(joinModal.roomId)?.hasPassword || roomStore.roomError?.code === 'room_password_invalid'))
const joinModalError = computed(() => roomStore.roomError?.code === 'room_password_invalid' ? '该房间需要密码' : '')
const canConfirmJoin = computed(() => /^\d{6}$/.test(joinModal.roomId) && roomStore.isConnected && (joinModal.password.trim() || !joinModalNeedsPassword.value))

const statusText = computed(() => {
  const map = {
    idle: '未连接',
    connecting: '连接中',
    open: '已连接',
    closed: '已断开',
    reconnecting: '重连中',
    error: '连接异常',
  }
  return map[roomStore.socketStatus] || roomStore.socketStatus
})

const statusKind = computed(() => {
  if (roomStore.socketStatus === 'open') return 'success'
  if (roomStore.socketStatus === 'reconnecting' || roomStore.socketStatus === 'connecting') return 'warning'
  return 'danger'
})

watch(
  () => roomStore.roomErrorSeq,
  () => {
    if (roomStore.roomError?.code !== 'room_password_invalid') return
    if (!joinModal.roomId) {
      joinModal.roomId = joinDraft.roomId
    }
    isJoinModalOpen.value = true
  },
)

function selectRoom(room) {
  joinDraft.roomId = room.roomId
}

function joinRoom() {
  if (!/^\d{6}$/.test(joinDraft.roomId)) {
    toast.error('请输入 6 位数字房间号')
    return
  }

  const room = findRoom(joinDraft.roomId)
  if (room?.hasPassword) {
    openJoinModal(joinDraft.roomId)
    return
  }

  emit('join-room', {
    roomId: joinDraft.roomId,
    password: '',
  })
}

function openCreateModal() {
  isCreateModalOpen.value = true
}

function closeCreateModal() {
  isCreateModalOpen.value = false
}

function openJoinModal(roomId) {
  joinModal.roomId = roomId
  joinModal.password = ''
  isJoinModalOpen.value = true
}

function closeJoinModal() {
  isJoinModalOpen.value = false
}

function confirmJoinRoom() {
  if (!/^\d{6}$/.test(joinModal.roomId)) {
    toast.error('请输入 6 位数字房间号')
    return
  }

  if (joinModalNeedsPassword.value && !joinModal.password.trim()) {
    toast.error('请输入房间密码')
    return
  }

  emit('join-room', {
    roomId: joinModal.roomId,
    password: joinModal.password.trim(),
  })
}

function createRoom() {
  const roomName = createDraft.roomName.trim()
  if (!roomName) {
    toast.error('请输入房间名')
    return
  }

  emit('create-room', {
    roomName,
    password: createDraft.password.trim(),
    hidden: createDraft.hidden,
  })
}

function findRoom(roomId) {
  return roomStore.roomList.find((room) => room.roomId === roomId)
}
</script>

<style scoped>
.room-select-page {
  min-height: calc(100vh - 136px);
  display: grid;
  place-items: center;
}

.room-select-panel {
  width: min(920px, 100%);
  padding: 24px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #fff;
}

.panel-header,
.create-row,
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.panel-header {
  margin-bottom: 18px;
}

.panel-header h2,
.modal-header h2 {
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;
}

.panel-header p,
.create-row p,
.modal-header p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}

.join-room-form {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) auto;
  gap: 10px;
  margin-bottom: 14px;
}

.join-room-form label,
.modal-form label {
  display: grid;
  gap: 6px;
}

.join-room-form span,
.modal-form span {
  color: #667085;
  font-size: 13px;
}

.text-input {
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #cfd7e3;
  border-radius: 8px;
  outline: none;
}

.text-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgb(37 99 235 / 12%);
}

.create-row {
  padding: 12px;
  margin-bottom: 18px;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  background: #f8fafc;
}

.room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.room-option {
  min-height: 98px;
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #fff;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
}

.room-option strong,
.room-option span,
.room-option small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-option span,
.room-option small {
  color: #667085;
  font-size: 12px;
}

.room-option:hover,
.room-option.is-selected {
  border-color: #2563eb;
  background: #eff6ff;
}

.empty-state {
  padding: 34px 12px;
  margin: 0;
  color: #667085;
  text-align: center;
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

.primary-button,
.ghost-button,
.icon-button {
  border-radius: 8px;
  cursor: pointer;
}

.primary-button {
  height: 40px;
  padding: 0 14px;
  border: 0;
  background: #2563eb;
  color: #fff;
}

.ghost-button {
  height: 38px;
  padding: 0 12px;
  border: 1px solid #cfd7e3;
  background: #fff;
  color: #1f2937;
}

.primary-button:disabled,
.ghost-button:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.modal-backdrop {
  position: fixed;
  z-index: 900;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgb(15 23 42 / 38%);
}

.create-modal {
  width: min(460px, 100%);
  padding: 18px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 18px 42px rgb(31 45 61 / 22%);
}

.icon-button {
  width: 32px;
  height: 32px;
  border: 1px solid #cfd7e3;
  background: #fff;
}

.modal-form {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}

.toggle-row {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}

.toggle-row input {
  width: 16px;
  height: 16px;
}

.form-error {
  margin: 0;
  color: #b42318;
  font-size: 13px;
}

@media (max-width: 720px) {
  .panel-header,
  .create-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .join-room-form {
    grid-template-columns: 1fr;
  }
}
</style>
