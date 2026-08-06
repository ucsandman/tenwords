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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'summarize') return
  fetch('http://localhost:4710/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks: msg.blocks }),
  })
    .then(async res => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return sendResponse({ ok: false, error: data.error || `service error ${res.status}` })
      sendResponse({ ok: true, data })
    })
    .catch(() => sendResponse({ ok: false, error: 'service not running' }))
  return true
})
