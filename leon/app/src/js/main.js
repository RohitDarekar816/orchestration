import axios from 'axios'
import '@aurora/style.css'

window.leonInitStatusEvent = new EventTarget()

import './init'
import Client from './client'
import { BuiltInCommands } from './built-in-commands'
import FileSystemAutocomplete from './file-system-autocomplete'
import SessionsPanel from './sessions'
import { onkeydownstartrecording, onkeydowninput } from './onkeydown'
import { initAuth, isAuthenticated, getToken, validateToken, authReady } from './auth'
import { initModelToggle } from './model-switch'

const config = {
  app: 'webapp',
  server_host: import.meta.env.VITE_LEON_HOST,
  server_port: import.meta.env.VITE_LEON_PORT,
  min_decibels: -40,
  max_blank_time: 1_000
}
const serverUrl =
  import.meta.env.VITE_LEON_NODE_ENV === 'production'
    ? ''
    : `${config.server_host}:${config.server_port}`

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [response] = await Promise.all([
      axios.get(`${serverUrl}/api/v1/info`)
    ])

    window.leonConfigInfo = response.data
    window.dispatchEvent(
      new CustomEvent('leon-config-ready', { detail: response.data })
    )
    const authEnabled = window.leonConfigInfo.auth?.enabled === true

    if (authEnabled) {
      const storedToken = getToken()
      let validToken = storedToken

      if (storedToken) {
        const user = await validateToken()
        if (!user) {
          validToken = null
        }
      }

      if (!validToken) {
        document.documentElement.classList.add('auth-required')
        document.body.classList.add('auth-required')
        document.body.classList.remove('settingup')
        initAuth()
        const authSucceeded = await authReady
        if (!authSucceeded) return
        document.documentElement.classList.remove('auth-required')
        document.body.classList.remove('auth-required')
        document.body.classList.add('settingup')
      }
    }

    const sessionsResponse = await axios.get(`${serverUrl}/api/v1/sessions`)

    const input = document.querySelector('#utterance')
    const mic = document.querySelector('#mic-button')
    const v = document.querySelector('#version small')
    const infoButton = document.querySelector('#info')
    const client = new Client(config.app, serverUrl, input, {
      activeSessionId: sessionsResponse.data.active_session_id
    })
    const sessionsPanel = new SessionsPanel({
      serverUrl,
      socket: client.socket,
      activeSessionId: sessionsResponse.data.active_session_id,
      initialPayload: sessionsResponse.data,
      onSelect: (sessionId) => client.setActiveSession(sessionId)
    })
    const fileSystemAutocomplete = new FileSystemAutocomplete({
      serverUrl,
      input
    })
    const builtInCommands = new BuiltInCommands({
      serverUrl,
      input,
      getActiveSessionId: () => sessionsPanel.getActiveSessionId(),
      onCommandExecuted: (commandInput) => {
        if (commandInput.trim().startsWith('/session')) {
          void sessionsPanel.refresh()
        }
      },
      onSubmitToChat: (clientAction) => {
        return client.sendUtterance(clientAction.utterance, {
          commandContext: {
            forcedRoutingMode: clientAction.command_context?.forced_routing_mode,
            forcedSkillName: clientAction.command_context?.forced_skill_name,
            forcedToolName: clientAction.command_context?.forced_tool_name
          }
        })
      }
    })

    const infoKeys = [
      'timeZone', 'telemetry', 'gpu', 'graphicsComputeAPI',
      'totalVRAM', 'freeVRAM', 'usedVRAM', 'llm', 'stt', 'tts',
      'mood', 'version'
    ]
    const infoToDisplay = {}
    infoKeys.forEach((key) => {
      infoToDisplay[key] = window.leonConfigInfo[key]
    })

    v.textContent += window.leonConfigInfo.version

    client.updateMood(window.leonConfigInfo.mood)
    client.setSessionPanel(sessionsPanel)
    sessionsPanel.init()
    client.init()
    fileSystemAutocomplete.attach(input)
    builtInCommands.init()
    initModelToggle(serverUrl)

    infoButton.addEventListener('click', () => {
      alert(JSON.stringify(infoToDisplay, null, 2))
    })

    document.addEventListener('keydown', (e) => {
      onkeydownstartrecording(e, () => {
        client.asrStartRecording()
      })
    })

    input.addEventListener('keydown', (e) => {
      onkeydowninput(e, client)
    })

    mic.addEventListener('click', (e) => {
      e.preventDefault()
      client.asrStartRecording()
    })
  } catch (e) {
    alert(`Error: ${e.message}; ${JSON.stringify(e.response?.data)}`)
    console.error(e)
  }
})
