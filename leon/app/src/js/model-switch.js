import axios from 'axios'

const STORAGE_ONLINE = 'leon_model_online'
const STORAGE_LOCAL = 'leon_model_local'
const DEFAULT_ONLINE = 'openrouter/nvidia/nemotron-3-super-120b-a12b:free'
const DEFAULT_LOCAL = 'ollama/qwen2.5:7b'

let currentTarget = ''

function getOnlineTarget() {
  return localStorage.getItem(STORAGE_ONLINE) || DEFAULT_ONLINE
}

function getLocalTarget() {
  return localStorage.getItem(STORAGE_LOCAL) || DEFAULT_LOCAL
}

function isLocal(target) {
  return target.startsWith('ollama/')
}

function updateUI(current) {
  const label = document.querySelector('#model-label')
  if (label) {
    label.textContent = isLocal(current) ? 'local' : 'online'
    label.style.color = isLocal(current) ? 'var(--green-color, #4caf50)' : 'var(--blue-color, #42a5f5)'
  }
}

export async function initModelToggle(serverUrl) {
  const btn = document.querySelector('#model-toggle')
  if (!btn) return

  const info = window.leonConfigInfo
  currentTarget = info?.llm?.targetValue || ''

  updateUI(currentTarget)

  btn.addEventListener('click', async () => {
    const newTarget = isLocal(currentTarget) ? getOnlineTarget() : getLocalTarget()

    btn.disabled = true
    btn.style.opacity = '0.5'

    try {
      await axios.post(`${serverUrl}/api/v1/llm/switch`, { target: newTarget })
      currentTarget = newTarget
      updateUI(currentTarget)
    } catch (err) {
      console.error('Failed to switch model:', err)
      alert(`Failed to switch model: ${err.message}`)
    } finally {
      btn.disabled = false
      btn.style.opacity = '1'
    }
  })
}
