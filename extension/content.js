;(async () => {
  const st = (window.__tenwords ??= { active: false, busy: false, originals: new Map(), banner: null })
  if (st.busy) return
  if (st.active) return restore()

  st.busy = true
  try {
    await condense()
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

    toast('TenWords: condensing…', 60000)
    const blocks = els.map((el, i) => ({ id: `p${i}`, text: el.textContent.trim() }))
    const resp = await chrome.runtime.sendMessage({ type: 'summarize', blocks })
    clearToast()
    if (!resp?.ok) {
      return toast(`TenWords: ${resp?.error || 'no response'} — start the service with launch.cmd`)
    }

    const byId = new Map(resp.data.summaries.map(s => [s.id, s.text]))
    els.forEach((el, i) => {
      const summary = byId.get(`p${i}`)
      if (!summary) return
      st.originals.set(el, { html: el.innerHTML, style: el.getAttribute('style') })
      el.textContent = summary
      el.style.lineHeight = '1.9'
      el.style.marginTop = '1.6em'
      el.style.marginBottom = '1.6em'
    })
    banner(resp.data.tldr)
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
      'position:sticky', 'top:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'gap:12px',
      'padding:14px 18px', 'background:#1a1a1a', 'color:#faf8f4',
      'font:italic 16px/1.5 Georgia,serif',
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
    setTimeout(() => div.remove(), ms)
  }

  function clearToast() {
    document.getElementById('__tenwords_toast')?.remove()
  }
})()
