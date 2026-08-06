import { summarizeBlocks } from './lib/summarizer.js'

async function trigger(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  } catch (err) {
    console.error('TenWords: cannot run on this page:', err.message)
  }
}

chrome.action.onClicked.addListener(tab => trigger(tab.id))
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-tenwords' && tab?.id) trigger(tab.id)
})

function safePost(port, msg) {
  try { port.postMessage(msg) } catch { /* content side went away */ }
}

function apiClient(key) {
  return {
    messages: {
      create: async req => {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(req),
        })
        if (!res.ok) {
          if (res.status === 401) throw new Error('invalid API key — update it in TenWords options')
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error?.message || `Anthropic API error ${res.status}`)
        }
        return res.json()
      },
    },
  }
}

async function summarizeDirect(port, blocks, key) {
  await summarizeBlocks(blocks, apiClient(key), event => safePost(port, event))
  safePost(port, { type: 'done' })
}

async function summarizeViaService(port, blocks) {
  let res
  try {
    res = await fetch('http://localhost:4710/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({ blocks }),
    })
  } catch {
    throw new Error('service not running — start it with launch.cmd, or add an API key in TenWords options')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `service error ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (line.trim()) safePost(port, JSON.parse(line))
    }
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'summarize') return
  port.onMessage.addListener(async msg => {
    try {
      const { apiKey } = await chrome.storage.local.get('apiKey')
      if (apiKey) await summarizeDirect(port, msg.blocks, apiKey)
      else await summarizeViaService(port, msg.blocks)
    } catch (err) {
      safePost(port, { type: 'error', error: err.message })
    }
  })
})
