<template>
  <section class="video-panel">
    <div class="player-wrap">
      <media-player
        ref="playerEl"
        class="plook-player"
        :title="playerTitle"
        :src="playerSources"
        playsinline
        crossorigin
        @play="onPlay"
        @pause="onPause"
        @seeked="onSeeked"
        @loaded-metadata="onLoadedMetadata"
      >
        <media-provider />
        <media-video-layout />
      </media-player>

      <div v-if="!roomStore.hasVideoSource" class="empty-video-state">
        <strong>等待房主设置视频源</strong>
        <span>当前房间不会自动加载默认视频，需要在房间设置中手动添加。</span>
      </div>
    </div>

    <footer class="video-meta">
      <span>#{{ roomStore.currentRoomId }} · {{ roomStore.roomName }}</span>
      <span>{{ roomStore.isRoomOwner ? '房主' : roomStore.userName }}</span>
    </footer>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import 'vidstack/player/styles/default/theme.css'
import 'vidstack/player/styles/default/layouts/video.css'
import 'vidstack/player'
import 'vidstack/player/layouts/default'
import 'vidstack/player/ui'
import { useRoomStore } from '../stores/room'
import { registerRemoteVideoHandler, useRoomSocket } from '../composables/useRoomSocket'
import { ROOM_EVENTS, SOCKET_TYPES, VIDEO_EVENTS, createPlaybackMessage, createSeekMessage } from '../utils/socketMessages'
import { throttle } from '../utils/timing'

const roomStore = useRoomStore()
const socket = useRoomSocket()
const playerEl = ref(null)
const playerTitle = 'Plook 一起看'

const playerSources = computed(() => {
  if (!roomStore.videoSource?.src) return []
  return [{
    src: roomStore.videoSource.src,
    type: normalizeVideoType(roomStore.videoSource.type),
  }]
})

const sendSeek = throttle((currentTime) => {
  socket.send(createSeekMessage({
    roomId: roomStore.currentRoomId,
    ownerId: roomStore.userName,
    currentTime,
  }))
}, 500)

registerRemoteVideoHandler(applyRemoteVideoMessage)

onBeforeUnmount(() => {
  registerRemoteVideoHandler(null)
  playerEl.value?.destroy?.()
})

function onPlay() {
  if (!roomStore.hasVideoSource || roomStore.isApplyingRemoteVideoEvent()) return
  const currentTime = playerEl.value?.currentTime ?? 0
  socket.send(createPlaybackMessage({
    roomId: roomStore.currentRoomId,
    ownerId: roomStore.userName,
    isPlaying: true,
    currentTime,
  }))
}

function onPause() {
  if (!roomStore.hasVideoSource || roomStore.isApplyingRemoteVideoEvent()) return
  const currentTime = playerEl.value?.currentTime ?? 0
  socket.send(createPlaybackMessage({
    roomId: roomStore.currentRoomId,
    ownerId: roomStore.userName,
    isPlaying: false,
    currentTime,
  }))
}

function onSeeked() {
  if (!roomStore.hasVideoSource || roomStore.isApplyingRemoteVideoEvent()) return
  sendSeek(playerEl.value?.currentTime ?? 0)
}

function onLoadedMetadata() {
  applyPlaybackSnapshot()
}

function applyRemoteVideoMessage(message) {
  if (!playerEl.value || message.ownerId === roomStore.userName) return

  const data = message.data || {}
  roomStore.markRemoteVideoEvent(900)

  if (message.type === SOCKET_TYPES.ROOM && data.type === ROOM_EVENTS.SNAPSHOT) {
    applyPlaybackSnapshot()
    return
  }

  if (data.type === VIDEO_EVENTS.PLAYBACK) {
    if (Number.isFinite(data.currentTime)) {
      playerEl.value.currentTime = data.currentTime
    }
    if (data.play === 1) {
      playerEl.value.play?.()
    } else {
      playerEl.value.pause?.()
    }
    return
  }

  if (data.type === VIDEO_EVENTS.SEEK && Number.isFinite(data.reach)) {
    playerEl.value.currentTime = data.reach
  }
}

function applyPlaybackSnapshot() {
  if (!playerEl.value || !roomStore.hasVideoSource) return

  roomStore.markRemoteVideoEvent(900)
  const playback = roomStore.playback
  if (Number.isFinite(playback.currentTime)) {
    playerEl.value.currentTime = playback.currentTime
  }
  if (playback.playing) {
    playerEl.value.play?.()
  } else {
    playerEl.value.pause?.()
  }
}

function normalizeVideoType(type) {
  if (type === 'm3u8') {
    return 'application/x-mpegURL'
  }
  return type || 'video/mp4'
}
</script>

<style scoped>
.video-panel {
  min-width: 0;
}

.player-wrap {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #111827;
}

.plook-player {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #111827;
}

.empty-video-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 8px;
  color: #e5e7eb;
  text-align: center;
  pointer-events: none;
}

.empty-video-state strong {
  font-size: 18px;
  font-weight: 700;
}

.empty-video-state span {
  color: #9ca3af;
  font-size: 13px;
}

.video-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  color: #667085;
  font-size: 13px;
}
</style>
