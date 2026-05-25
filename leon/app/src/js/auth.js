import axios from 'axios'

const LS_KEY = 'leon_auth_token'
const serverUrl =
  import.meta.env.VITE_LEON_NODE_ENV === 'production'
    ? ''
    : `${import.meta.env.VITE_LEON_HOST}:${import.meta.env.VITE_LEON_PORT}`

export function getToken() {
  return localStorage.getItem(LS_KEY)
}

export function clearToken() {
  localStorage.removeItem(LS_KEY)
}

export function setToken(token) {
  localStorage.setItem(LS_KEY, token)
}

export function isAuthenticated() {
  return !!getToken()
}

export async function login(email, password) {
  const res = await axios.post(`${serverUrl}/api/v1/auth/login`, { email, password })
  const data = res.data
  setToken(data.access_token)
  return data
}

export async function register(email, password, fullName) {
  const res = await axios.post(`${serverUrl}/api/v1/auth/register`, {
    email,
    password,
    full_name: fullName
  })
  return res.data
}

export async function validateToken() {
  const token = getToken()
  if (!token) return null
  try {
    const res = await axios.get(`${serverUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return res.data
  } catch {
    clearToken()
    return null
  }
}

let resolveAuthReady = null
export const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve
})

export function initAuth() {
  const section = document.querySelector('#auth-section')
  const tabs = document.querySelectorAll('.auth-tab')
  const loginForm = document.querySelector('#auth-form-login')
  const emailInput = document.querySelector('#auth-email')
  const passwordInput = document.querySelector('#auth-password')
  const nameInput = document.querySelector('#auth-name')
  const nameField = document.querySelector('#auth-name-field')
  const errorDiv = document.querySelector('#auth-error')
  const submitBtn = document.querySelector('#auth-submit')

  if (!section) return

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      const isRegister = tab.dataset.tab === 'register'
      nameField.classList.toggle('hidden', !isRegister)
      submitBtn.textContent = isRegister ? 'Sign Up' : 'Sign In'
      errorDiv.classList.add('hidden')
    })
  })

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = emailInput.value.trim()
    const password = passwordInput.value
    const isRegister = document.querySelector('.auth-tab.active').dataset.tab === 'register'
    const fullName = nameInput.value.trim()

    if (!email || !password) {
      errorDiv.textContent = 'Email and password are required'
      errorDiv.classList.remove('hidden')
      return
    }

    if (isRegister && !fullName) {
      errorDiv.textContent = 'Full name is required'
      errorDiv.classList.remove('hidden')
      return
    }

    submitBtn.disabled = true
    errorDiv.classList.add('hidden')

    try {
      if (isRegister) {
        await register(email, password, fullName)
        await login(email, password)
      } else {
        await login(email, password)
      }
      section.style.display = 'none'
      resolveAuthReady(true)
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.detail ||
        'Authentication failed'
      errorDiv.textContent = msg
      errorDiv.classList.remove('hidden')
      submitBtn.disabled = false
      resolveAuthReady(false)
    }
  })
}
