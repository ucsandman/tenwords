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

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'summarize') return
  port.onMessage.addListener(async msg => {
    try {
      const res = await fetch('http://localhost:4710/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify({ blocks: msg.blocks }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return safePost(port, { type: 'error', error: data.error || `service error ${res.status}` })
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
    } catch {
      safePost(port, { type: 'error', error: 'service not running' })
    }
  })
})
