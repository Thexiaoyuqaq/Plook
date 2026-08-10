import { createRouter, createWebHashHistory } from 'vue-router'
import { getSavedUserName } from '../utils/session'

const routes = [
  {
    path: '/',
    name: 'login',
    component: () => import('../views/login.vue'),
  },
  {
    path: '/pc',
    name: 'room',
    component: () => import('../views/viewsVideo.vue'),
    redirect: '/pc/select-room',
    children: [
      {
        path: 'select-room',
        name: 'select-room',
        component: () => import('../components/selectRoom.vue'),
      },
      {
        path: 'video/:roomId(\\d{6})',
        name: 'video',
        component: () => import('../components/viewsVideo.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  const isLoggedIn = Boolean(getSavedUserName())
  if (!isLoggedIn && to.name !== 'login') {
    return { name: 'login' }
  }
  if (isLoggedIn && to.name === 'login') {
    return { name: 'select-room' }
  }
  return true
})

export default router
