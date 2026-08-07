;(async () => {
  const st = (window.__tenwords ??= { active: false, busy: false, originals: new Map(), banner: null })
  if (st.busy) return
  if (st.active) return restore()

  st.busy = true
  try {
    await condense()
  } catch (err) {
    clearToast()
    toast('TenWords: ' + err.message)
  } finally {
    st.busy = false
  }

  function countWords(t) {
    return t.trim().split(/\s+/).filter(Boolean).length
  }

  function container() {
    return document.querySelector('article') || document.querySelector('main') || document.body
  }

  function candidates() {
    return [...container().querySelectorAll('p')].filter(p => countWords(p.textContent) >= 16)
  }

  async function condense() {
    const els = candidates()
    if (els.length === 0) return toast('TenWords: no long paragraphs found on this page')

    const blocks = els.map((el, i) => ({ id: `p${i}`, text: el.textContent.trim() }))
    const elById = new Map(els.map((el, i) => [`p${i}`, el]))
    toast(`TenWords: condensing 0/${blocks.length}…`, 0)

    let replaced = 0
    const failure = await new Promise(resolve => {
      const port = chrome.runtime.connect({ name: 'summarize' })
      port.onMessage.addListener(msg => {
        if (msg.type === 'batch') {
          for (const s of msg.summaries) {
            const el = elById.get(s.id)
            if (!el) continue
            st.originals.set(el, { html: el.innerHTML, style: el.getAttribute('style') })
            el.textContent = s.text
            el.style.lineHeight = '1.9'
            el.style.marginTop = '1.6em'
            el.style.marginBottom = '1.6em'
            replaced++
          }
          toast(`TenWords: condensing ${replaced}/${blocks.length}…`, 0)
        } else if (msg.type === 'tldr') {
          banner(msg.tldr)
        } else if (msg.type === 'error') {
          resolve(msg.error)
          port.disconnect()
        } else if (msg.type === 'done') {
          resolve(null)
          port.disconnect()
        }
      })
      port.onDisconnect.addListener(() => resolve('lost connection to the TenWords service'))
      port.postMessage({ blocks })
    })
    clearToast()
    if (failure) {
      restore()
      return toast(`TenWords: ${failure}`, 8000)
    }
    st.active = true
  }

  function restore() {
    for (const [el, orig] of st.originals) {
      el.innerHTML = orig.html
      if (orig.style === null) el.removeAttribute('style')
      else el.setAttribute('style', orig.style)
    }
    st.originals.clear()
    st.banner?.remove()
    st.banner = null
    st.active = false
  }

  function banner(tldr) {
    const div = document.createElement('div')
    div.setAttribute('style', [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'gap:12px', 'box-sizing:border-box',
      'padding:14px 18px', 'background:#1a1a1a', 'color:#faf8f4',
      'font:italic 16px/1.5 Georgia,serif', 'box-shadow:0 2px 12px rgba(0,0,0,.35)',
    ].join(';'))
    const text = document.createElement('span')
    text.textContent = tldr
    text.style.flex = '1'
    const btn = document.createElement('button')
    btn.textContent = 'restore original'
    btn.setAttribute('style', 'font:12px sans-serif;padding:6px 10px;cursor:pointer;background:#faf8f4;color:#1a1a1a;border:none;border-radius:4px')
    btn.addEventListener('click', restore)
    div.append(text, btn)
    document.body.prepend(div)
    st.banner = div
  }

  function toast(msg, ms = 4000) {
    clearToast()
    const div = document.createElement('div')
    div.id = '__tenwords_toast'
    div.textContent = msg
    div.setAttribute('style', [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:2147483647',
      'padding:10px 16px', 'background:#1a1a1a', 'color:#faf8f4',
      'font:13px sans-serif', 'border-radius:6px', 'box-shadow:0 2px 12px rgba(0,0,0,.3)',
    ].join(';'))
    document.body.appendChild(div)
    if (ms > 0) setTimeout(() => div.remove(), ms)
  }

  function clearToast() {
    document.getElementById('__tenwords_toast')?.remove()
  }
})()
