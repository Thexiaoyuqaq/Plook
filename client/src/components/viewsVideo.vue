<template>
  <section class="watch-room">
    <huanhe-video />

    <aside class="chat-panel">
      <header class="chat-header">
        <div>
          <h2>{{ roomStore.roomName || '房间消息' }}</h2>
          <p>#{{ roomStore.currentRoomId }} · {{ roomStore.members.length }} 人在线 · {{ roomStore.messages.length }} 条消息</p>
        </div>
        <span class="status-pill" :class="roomStore.isConnected ? 'is-success' : 'is-danger'">
          {{ roomStore.isConnected ? '在线' : '离线' }}
        </span>
      </header>

      <VList ref="scrollerRef" class="chat-list" :data="roomStore.messages">
        <template #default="{ item }">
          <ChatMessage :message="item" :user-name="roomStore.userName" />
        </template>
      </VList>

      <form class="send-msg" @submit.prevent="sendMessage">
        <input
          v-model="myMessage"
          class="text-input"
          maxlength="300"
          placeholder="发送消息"
          @keyup.enter.exact.prevent="sendMessage"
        />
        <button class="primary-button" type="submit" :disabled="!roomStore.isConnected">发送</button>
      </form>
    </aside>

    <div v-if="roomStore.isRoomSettingsOpen" class="drawer-backdrop" @click.self="roomStore.closeRoomSettings">
      <section class="settings-drawer">
        <header class="drawer-header">
          <div>
            <h2 class="drawer-title">房间设置</h2>
            <p>{{ roomStore.isRoomOwner ? '你是房主，可以调整房间可见性、密码和视频源。' : '当前仅房主可以调整房间设置。' }}</p>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" @click="roomStore.closeRoomSettings">x</button>
        </header>

        <div class="settings-grid">
          <form class="settings-section" @submit.prevent="saveRoomSettings">
            <header>
              <h3>房间信息</h3>
              <span>{{ roomStore.hidden ? '私密房间' : '公开房间' }}</span>
            </header>

            <label>
              <span>房间名</span>
              <input
                v-model="settingsDraft.roomName"
                class="text-input"
                :disabled="!roomStore.isRoomOwner"
                maxlength="30"
              />
            </label>

            <label>
              <span>房间密码</span>
              <input
                v-model="settingsDraft.password"
                class="text-input"
                :disabled="!roomStore.isRoomOwner"
                maxlength="40"
                type="password"
                :placeholder="roomStore.hasPassword ? '留空将清除当前密码' : '可选，不填则无密码'"
              />
            </label>

            <label class="toggle-row">
              <input v-model="settingsDraft.hidden" type="checkbox" :disabled="!roomStore.isRoomOwner" />
              <span>隐藏房间，不显示在公开房间列表</span>
            </label>

            <button class="primary-button" type="submit" :disabled="!roomStore.isRoomOwner">
              保存房间设置
            </button>
          </form>

          <form class="settings-section" @submit.prevent="setVideoSrc">
            <header>
              <h3>视频源</h3>
              <span>{{ roomStore.sourceLocked ? '已锁定' : '未锁定' }}</span>
            </header>

            <div v-if="roomStore.isRoomOwner" class="lock-row">
              <label class="switch">
                <input v-model="sourceLockedDraft" type="checkbox" @change="toggleSourceLock" />
                <span></span>
              </label>
              <div>
                <strong>{{ roomStore.sourceLocked ? '视频源已锁定' : '视频源未锁定' }}</strong>
                <small>锁定后只有房主可以修改视频源。</small>
              </div>
            </div>

            <label>
              <span>视频源地址</span>
              <input
                v-model="videoSrc.src"
                class="text-input"
                :disabled="!canEditSource"
                placeholder="https://example.com/video.mp4"
              />
            </label>

            <fieldset :disabled="!canEditSource">
              <legend>视频类型</legend>
              <div class="segmented">
                <label v-for="option in videoTypeOptions" :key="option.value">
                  <input v-model="videoSrc.type" type="radio" :value="option.value" />
                  <span>{{ option.label }}</span>
                </label>
              </div>
            </fieldset>

            <p v-if="formError" class="form-error">{{ formError }}</p>
            <button class="primary-button" type="submit" :disabled="!canEditSource">切换视频源</button>
          </form>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { VList } from 'virtua/vue'
import { toast } from 'vue-sonner'
import HuanheVideo from './Huanhe-video.vue'
import ChatMessage from './chat.vue'
import { useRoomStore } from '../stores/room'
import { useRoomSocket } from '../composables/useRoomSocket'

const roomStore = useRoomStore()
const socket = useRoomSocket()
const scrollerRef = ref(null)
const myMessage = ref('')
const videoSrc = reactive({ src: '', type: 'video/mp4' })
const settingsDraft = reactive({ roomName: '', password: '', hidden: false })
const sourceLockedDraft = ref(false)
const formError = ref('')

const videoTypeOptions = [
  { label: 'MP4', value: 'video/mp4' },
  { label: 'M3U8', value: 'm3u8' },
]

const canEditSource = computed(() => !roomStore.sourceLocked || roomStore.isRoomOwner)

watch(
  () => roomStore.videoSource,
  (source) => {
    videoSrc.src = source?.src || ''
    videoSrc.type = source?.type || 'video/mp4'
  },
  { deep: true, immediate: true },
)

watch(
  () => [roomStore.roomName, roomStore.hidden],
  () => {
    settingsDraft.roomName = roomStore.roomName
    settingsDraft.password = ''
    settingsDraft.hidden = roomStore.hidden
  },
  { immediate: true },
)

watch(
  () => roomStore.sourceLocked,
  (locked) => {
    sourceLockedDraft.value = locked
  },
  { immediate: true },
)

watch(
  () => roomStore.messages.length,
  async (length) => {
    await nextTick()
    scrollerRef.value?.scrollToIndex?.(Math.max(length - 1, 0))
  },
)

function sendMessage() {
  if (socket.sendChat(myMessage.value)) {
    myMessage.value = ''
  }
}

function saveRoomSettings() {
  if (!roomStore.isRoomOwner) return
  if (!settingsDraft.roomName.trim()) {
    toast.error('房间名不能为空')
    return
  }

  socket.updateRoomSettings({
    roomName: settingsDraft.roomName.trim(),
    password: settingsDraft.password.trim(),
    hidden: settingsDraft.hidden,
  })
  settingsDraft.password = ''
}

function toggleSourceLock() {
  if (!roomStore.isRoomOwner) return
  socket.setSourceLocked(sourceLockedDraft.value)
}

function setVideoSrc() {
  formError.value = validateVideoSource(videoSrc)
  if (formError.value) return

  if (socket.sendSource({ ...videoSrc })) {
    toast.success('视频源已提交')
  }
}

function validateVideoSource(source) {
  if (!source.src) return '请输入视频源'

  try {
    const url = new URL(source.src)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return '只支持 HTTP/HTTPS 视频源'
    }
  } catch {
    return '请输入正确的视频源地址'
  }

  if (!source.type) return '请选择视频类型'
  return ''
}
</script>

<style scoped>
.watch-room {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: 16px;
  min-height: calc(100vh - 136px);
}

.chat-panel {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #fff;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid #edf0f5;
}

.chat-header h2 {
  margin: 0;
  font-size: 16px;
  letter-spacing: 0;
}

.chat-header p,
.drawer-header p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 12px;
}

.chat-list {
  min-height: 320px;
  padding: 12px;
}

.send-msg {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #edf0f5;
}

.text-input {
  min-width: 0;
  height: 38px;
  padding: 0 10px;
  border: 1px solid #cfd7e3;
  border-radius: 8px;
  outline: none;
}

.text-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgb(37 99 235 / 12%);
}

.text-input:disabled,
fieldset:disabled {
  opacity: 0.64;
  cursor: not-allowed;
}

.primary-button {
  height: 38px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}

.primary-button:disabled {
  background: #98a2b3;
  cursor: not-allowed;
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

.status-pill.is-danger {
  border-color: #f2aaa4;
  background: #fff1f0;
  color: #a33127;
}

.drawer-backdrop {
  position: fixed;
  z-index: 900;
  inset: 0;
  display: grid;
  align-items: end;
  background: rgb(15 23 42 / 38%);
}

.settings-drawer {
  width: 100%;
  max-height: min(86vh, 760px);
  overflow: auto;
  padding: 18px;
  border-radius: 12px 12px 0 0;
  background: #fff;
  box-shadow: 0 -16px 36px rgb(31 45 61 / 18%);
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.drawer-title {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0;
}

.icon-button {
  width: 32px;
  height: 32px;
  border: 1px solid #cfd7e3;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.settings-section {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 14px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #fff;
}

.settings-section header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.settings-section h3 {
  margin: 0;
  font-size: 15px;
}

.settings-section header span,
.settings-section label > span,
.settings-section legend {
  color: #667085;
  font-size: 13px;
}

.settings-section label,
.settings-section fieldset {
  display: grid;
  gap: 6px;
}

.settings-section fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.toggle-row {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}

.toggle-row input {
  width: 16px;
  height: 16px;
}

.lock-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #f8fafc;
}

.lock-row strong,
.lock-row small {
  display: block;
}

.lock-row small {
  margin-top: 3px;
  color: #667085;
}

.switch input {
  position: absolute;
  opacity: 0;
}

.switch span {
  width: 42px;
  height: 24px;
  display: block;
  position: relative;
  border-radius: 999px;
  background: #cbd5e1;
  cursor: pointer;
}

.switch span::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 160ms ease;
}

.switch input:checked + span {
  background: #2563eb;
}

.switch input:checked + span::after {
  transform: translateX(18px);
}

.segmented {
  display: flex;
  gap: 8px;
}

.segmented label {
  display: block;
}

.segmented input {
  position: absolute;
  opacity: 0;
}

.segmented span {
  display: block;
  min-width: 78px;
  padding: 8px 12px;
  border: 1px solid #cfd7e3;
  border-radius: 8px;
  color: #1f2937;
  text-align: center;
  cursor: pointer;
}

.segmented input:checked + span {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.form-error {
  margin: 0;
  color: #b42318;
  font-size: 13px;
}

@media (max-width: 960px) {
  .settings-grid,
  .watch-room {
    grid-template-columns: 1fr;
  }

  .chat-panel {
    min-height: 420px;
  }
}
</style>
