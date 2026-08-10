<template>
  <div class="app-shell">
    <div class="app-header-row">
      <layout-header />
    </div>

    <main class="app-main">
      <router-view @join-room="joinRoom" @create-room="createRoom" />
    </main>

    <div class="app-footer-row">
      <layout-footer />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import layoutHeader from '../layout/layoutHeader.vue'
import layoutFooter from '../layout/layoutFooter.vue'
import { useRoomStore } from '../stores/room'
import { useRoomSocket } from '../composables/useRoomSocket'
import { getSavedUserName } from '../utils/session'

const route = useRoute()
const router = useRouter()
const roomStore = useRoomStore()
const socket = useRoomSocket()
const autoJoinRoomId = ref('')

const routeRoomId = computed(() => {
  const value = String(route.params.roomId || '').trim()
  return /^\d{6}$/.test(value) ? value : ''
})

onMounted(() => {
  const cachedUserName = getSavedUserName()
  if (!cachedUserName) {
    router.push({ name: 'login' })
    return
  }

  roomStore.setUserName(cachedUserName)
  socket.connect(cachedUserName)
})

onBeforeUnmount(() => {
  socket.disconnect()
})

watch(
  () => [roomStore.socketStatus, routeRoomId.value],
  ([status, roomId]) => {
    if (status !== 'open' || !roomId) return
    if (roomStore.currentRoomId === roomId || autoJoinRoomId.value === roomId) return

    autoJoinRoomId.value = roomId
    socket.joinRoom({ roomId })
  },
  { immediate: true },
)

watch(
  () => roomStore.currentRoomId,
  (roomId) => {
    if (!roomId || routeRoomId.value === roomId) return
    router.replace({ name: 'video', params: { roomId } })
  },
)

function joinRoom(payload) {
  socket.joinRoom(payload)
}

function createRoom(payload) {
  socket.createRoom(payload)
}
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: 60px minmax(0, 1fr) 44px;
  min-height: 100vh;
  background: #f6f8fb;
}

.app-header-row {
  border-bottom: 1px solid #d8dee8;
  background: #fff;
}

.app-main {
  min-height: 0;
  padding: 16px;
}

.app-footer-row {
  border-top: 1px solid #d8dee8;
  background: #fff;
}
</style>
