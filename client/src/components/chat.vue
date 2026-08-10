<template>
  <article class="chat-item" :class="{ 'is-mine': isMine, 'is-system': message.type === 'system' }">
    <p v-if="message.type === 'system'" class="system-text">{{ message.text }}</p>
    <template v-else>
      <header>
        <span>{{ isMine ? userName : message.ownerId }}</span>
        <time>{{ timeText }}</time>
      </header>
      <p>{{ message.text }}</p>
    </template>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
})

const isMine = computed(() => props.message.ownerId === props.userName)
const timeText = computed(() => {
  if (!props.message.sentAt) return ''
  return new Date(props.message.sentAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
})
</script>

<style scoped>
.chat-item {
  width: fit-content;
  max-width: 86%;
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #fff;
}

.chat-item.is-mine {
  margin-left: auto;
  border-color: #a7d7a7;
  background: #f0faf0;
}

.chat-item.is-system {
  width: 100%;
  max-width: 100%;
  border-color: transparent;
  background: transparent;
  text-align: center;
}

.chat-item header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 6px;
  color: #667085;
  font-size: 12px;
}

.chat-item p {
  margin: 0;
  color: #1f2937;
  word-break: break-word;
}

.system-text {
  color: #667085;
  font-size: 13px;
}
</style>
