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

/**
 * Show a form-level error message.
 */
function showError(errorDiv, submitBtn, message) {
  errorDiv.textContent = message
  errorDiv.classList.remove('hidden')
  submitBtn.disabled = false
}

/**
 * Hide a form-level error message.
 */
function hideError(errorDiv) {
  errorDiv.classList.add('hidden')
}

export function initAuth() {
  const section = document.querySelector('#auth-section')

  if (!section) return

  const tabs = document.querySelectorAll('.auth-tab')
  const loginForm = document.querySelector('#auth-form-login')
  const registerForm = document.querySelector('#auth-form-register')

  // Login form elements
  const loginEmail = document.querySelector('#auth-email-login')
  const loginPassword = document.querySelector('#auth-password-login')
  const loginError = document.querySelector('#auth-error-login')
  const loginSubmit = document.querySelector('#auth-submit-login')

  // Register form elements
  const registerName = document.querySelector('#auth-name-register')
  const registerEmail = document.querySelector('#auth-email-register')
  const registerPassword = document.querySelector('#auth-password-register')
  const registerError = document.querySelector('#auth-error-register')
  const registerSubmit = document.querySelector('#auth-submit-register')

  /**
   * Switch the visible form and active tab.
   */
  function switchTab(targetTab) {
    tabs.forEach((t) => t.classList.remove('active'))
    targetTab.classList.add('active')

    const isRegister = targetTab.dataset.tab === 'register'
    loginForm.classList.toggle('active', !isRegister)
    registerForm.classList.toggle('active', isRegister)

    // Clear errors and inputs when switching tabs
    hideError(loginError)
    hideError(registerError)
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab))
  })

  /**
   * Handle login form submission.
   */
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()

    const email = loginEmail.value.trim()
    const password = loginPassword.value

    if (!email || !password) {
      showError(loginError, loginSubmit, 'Email and password are required')
      return
    }

    loginSubmit.disabled = true
    hideError(loginError)

    try {
      await login(email, password)
      section.style.display = 'none'
      resolveAuthReady(true)
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.detail ||
        'Login failed. Please check your credentials.'
      showError(loginError, loginSubmit, msg)
    }
  })

  /**
   * Handle register form submission.
   */
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault()

    const fullName = registerName.value.trim()
    const email = registerEmail.value.trim()
    const password = registerPassword.value

    if (!fullName) {
      showError(registerError, registerSubmit, 'Full name is required')
      return
    }
    if (!email || !password) {
      showError(registerError, registerSubmit, 'Email and password are required')
      return
    }

    registerSubmit.disabled = true
    hideError(registerError)

    try {
      await register(email, password, fullName)
      await login(email, password)
      section.style.display = 'none'
      resolveAuthReady(true)
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.detail ||
        'Registration failed. Please try again.'
      showError(registerError, registerSubmit, msg)
    }
  })
}
