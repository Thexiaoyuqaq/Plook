const USERNAME_KEY = 'plook_username'

export function getSavedUserName() {
  return window.localStorage.getItem(USERNAME_KEY) || ''
}

export function saveUserName(userName) {
  window.localStorage.setItem(USERNAME_KEY, userName)
}

export function clearSavedUserName() {
  window.localStorage.removeItem(USERNAME_KEY)
}
