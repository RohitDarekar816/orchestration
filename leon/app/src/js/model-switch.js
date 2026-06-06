import axios from 'axios'

const STORAGE_ONLINE = 'leon_model_online'

// Since local LLM support has been removed, the toggle only cycles
// between remote online providers stored in localStorage.
const DEFAULT_ONLINE = 'openrouter/nvidia/nemotron-3-super-120b-a12b:free'

let currentTarget = ''

function getOnlineTarget() {
  return localStorage.getItem(STORAGE_ONLINE) || DEFAULT_ONLINE
}

function updateUI(current) {
  const label = document.querySelector('#model-label')
  const btn = document.querySelector('#model-toggle')
  if (label) {
    // Display a short readable name: strip the provider prefix for brevity
    const parts = current.split('/')
    const displayName = parts.length > 1 ? parts.slice(1).join('/') : current
    label.textContent = displayName || 'online'
    label.style.color = 'var(--blue-color, #42a5f5)'
  }
  if (btn) {
    btn.title = `Current model: ${current}`
  }
}

export async function initModelToggle(serverUrl) {
  const btn = document.querySelector('#model-toggle')
  if (!btn) return

  const info = window.leonConfigInfo
  currentTarget = info?.llm?.targetValue || getOnlineTarget()

  updateUI(currentTarget)

  btn.addEventListener('click', async () => {
    // Prompt the user for a new online model target
    const newTarget = window.prompt(
      'Enter the model target (e.g. openai/gpt-4o, anthropic/claude-3-5-sonnet)',
      currentTarget
    )

    if (!newTarget || !newTarget.trim() || newTarget.trim() === currentTarget) {
      return
    }

    const trimmedTarget = newTarget.trim()

    btn.disabled = true
    btn.style.opacity = '0.5'

    try {
      await axios.post(`${serverUrl}/api/v1/llm/switch`, { target: trimmedTarget })
      localStorage.setItem(STORAGE_ONLINE, trimmedTarget)
      currentTarget = trimmedTarget
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
