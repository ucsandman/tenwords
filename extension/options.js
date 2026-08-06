const $ = id => document.getElementById(id)

function setStatus(msg, isError = false) {
  $('status').textContent = msg
  $('status').className = isError ? 'error' : ''
}

async function currentKey() {
  return $('key').value.trim() || (await chrome.storage.local.get('apiKey')).apiKey || ''
}

async function init() {
  const { apiKey } = await chrome.storage.local.get('apiKey')
  if (apiKey) setStatus(`Key saved (…${apiKey.slice(-4)}) — calling Anthropic directly.`)
  else setStatus('No key — using the local service.')
}

$('save').addEventListener('click', async () => {
  const key = $('key').value.trim()
  if (!key) return setStatus('Paste a key first, or use Remove key.', true)
  await chrome.storage.local.set({ apiKey: key })
  $('key').value = ''
  setStatus(`Key saved (…${key.slice(-4)}) — calling Anthropic directly.`)
})

$('remove').addEventListener('click', async () => {
  await chrome.storage.local.remove('apiKey')
  $('key').value = ''
  setStatus('Key removed — using the local service.')
})

$('verify').addEventListener('click', async () => {
  const key = await currentKey()
  if (!key) return setStatus('No key to verify.', true)
  setStatus('Checking…')
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    })
    if (res.ok) setStatus('Key works.')
    else if (res.status === 401) setStatus('Invalid key.', true)
    else setStatus(`Anthropic answered with status ${res.status}.`, true)
  } catch {
    setStatus('Could not reach api.anthropic.com.', true)
  }
})

init()
