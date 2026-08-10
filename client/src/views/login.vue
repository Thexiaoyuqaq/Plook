<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="brand-row">
        <img src="../assets/favicon.svg" alt="Plook" />
        <div>
          <h1>Plook</h1>
          <p>一起看视频</p>
        </div>
      </div>

      <form class="login-form" @submit.prevent="login">
        <input v-model="userName" class="text-input" maxlength="24" placeholder="输入昵称" />
        <button class="primary-button login-button" type="submit">进入</button>
      </form>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { useRoomStore } from '../stores/room'
import { getSavedUserName, saveUserName } from '../utils/session'

const router = useRouter()
const roomStore = useRoomStore()
const userName = ref(getSavedUserName() || roomStore.userName || '')

function login() {
  const trimmed = userName.value.trim()
  if (!trimmed) {
    toast.error('请输入昵称')
    return
  }

  saveUserName(trimmed)
  roomStore.setUserName(trimmed)
  router.push({ name: 'select-room' })
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #f6f8fb;
}

.login-panel {
  width: min(420px, 100%);
  padding: 28px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 40px rgb(31 45 61 / 8%);
}

.brand-row {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 24px;
}

.brand-row img {
  width: 52px;
  height: 52px;
}

.brand-row h1 {
  margin: 0;
  font-size: 26px;
  letter-spacing: 0;
}

.brand-row p {
  margin: 4px 0 0;
  color: #667085;
}

.login-form {
  display: grid;
  gap: 14px;
}

.text-input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid #cfd7e3;
  border-radius: 8px;
  outline: none;
}

.text-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgb(37 99 235 / 12%);
}

.primary-button {
  height: 42px;
  border: 0;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}

.primary-button:hover {
  background: #1d4ed8;
}

.login-button {
  width: 100%;
}
</style>
