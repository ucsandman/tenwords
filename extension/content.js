;(async () => {
  const st = (window.__tenwords ??= { active: false, busy: false, originals: new Map(), banner: null })
  const selectionOnly = window.__tenwordsSelectionOnly === true
  delete window.__tenwordsSelectionOnly
  if (st.busy) return
  if (st.active) {
    restore()
    if (!selectionOnly) return
  }

  st.busy = true
  try {
    await condense(selectionOnly)
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

  function candidates(selectionOnly) {
    const all = [...container().querySelectorAll('p')].filter(p => countWords(p.textContent) >= 16)
    if (!selectionOnly) return all
    const sel = getSelection()
    if (!sel || sel.isCollapsed) return all
    return all.filter(p => {
      for (let i = 0; i < sel.rangeCount; i++) {
        if (sel.getRangeAt(i).intersectsNode(p)) return true
      }
      return false
    })
  }

  async function condense(selectionOnly) {
    const els = candidates(selectionOnly)
    if (els.length === 0) {
      return toast(selectionOnly
        ? 'TenWords: no long paragraphs in the selection'
        : 'TenWords: no long paragraphs found on this page')
    }

    const blocks = els.map((el, i) => ({ id: `p${i}`, text: el.textContent.trim() }))
    const elById = new Map(els.map((el, i) => [`p${i}`, el]))
    ensureStyle()
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
            el.style.paddingLeft = '1.6em'
            el.style.textIndent = '-1.6em'
            el.setAttribute('data-tenwords', '')
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
      el.removeAttribute('data-tenwords')
      if (orig.style === null) el.removeAttribute('style')
      else el.setAttribute('style', orig.style)
    }
    st.originals.clear()
    st.banner?.remove()
    st.banner = null
    st.active = false
    document.getElementById('__tenwords_style')?.remove()
  }

  function ensureStyle() {
    if (document.getElementById('__tenwords_style')) return
    const SERIF = "Charter,'Sitka Text',Cambria,Georgia,serif"
    const style = document.createElement('style')
    style.id = '__tenwords_style'
    style.textContent = `
      #__tenwords_banner {
        position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
        display: flex; align-items: baseline; gap: 1.15em;
        box-sizing: border-box; margin: 0; padding: 13px 26px 14px;
        background: #fbfbfb; border-bottom: 1px solid #e2e2e2;
        font: 17px/1.5 ${SERIF}; color: #1f1f1f; text-align: left;
        animation: __tenwords_drop 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      #__tenwords_banner .__tw-label {
        flex: none; font-size: 11px; font-style: normal; letter-spacing: 0.18em;
        text-indent: 0.18em; text-transform: uppercase; white-space: nowrap; color: #595959;
      }
      #__tenwords_banner .__tw-tldr { flex: 1 1 auto; font-style: italic; text-wrap: balance; }
      #__tenwords_banner button {
        flex: none; margin: 0; padding: 0; border: 0; background: none; cursor: pointer;
        font: 13px/1.5 ${SERIF}; letter-spacing: 0; text-transform: none; color: #595959;
        text-decoration: underline; text-underline-offset: 3px;
        transition: color 150ms ease-out;
      }
      #__tenwords_banner button:hover { color: #1f1f1f; }
      #__tenwords_banner button:focus-visible { outline: 2px solid #9c2f26; outline-offset: 3px; }

      #__tenwords_toast {
        position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
        box-sizing: border-box; margin: 0; padding: 9px 16px 10px;
        background: #fbfbfb; border: 1px solid #e2e2e2; border-radius: 6px;
        font: italic 14px/1.45 ${SERIF}; color: #1f1f1f;
        font-variant-numeric: tabular-nums;
        animation: __tenwords_rise 240ms ease-out both;
      }

      [data-tenwords][data-tenwords] { animation: __tenwords_fade 420ms ease-out both; }
      [data-tenwords][data-tenwords]::before {
        content: '\\00B6'; display: inline-block; width: 1.6em; text-indent: 0;
        font: 1em/1 ${SERIF}; color: #9c2f26; opacity: 0.65;
      }

      @keyframes __tenwords_drop { from { transform: translateY(-100%); } to { transform: none; } }
      @keyframes __tenwords_rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @keyframes __tenwords_fade { from { opacity: 0; } to { opacity: 1; } }

      @media (prefers-reduced-motion: reduce) {
        #__tenwords_banner, #__tenwords_toast, [data-tenwords][data-tenwords] { animation: none; }
        #__tenwords_banner button { transition: none; }
      }
    `
    document.documentElement.append(style)
  }

  function banner(tldr) {
    ensureStyle()
    const div = document.createElement('div')
    div.id = '__tenwords_banner'
    const label = document.createElement('span')
    label.className = '__tw-label'
    label.textContent = 'TL;DR'
    const text = document.createElement('span')
    text.className = '__tw-tldr'
    text.textContent = tldr
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = 'restore original'
    btn.addEventListener('click', restore)
    div.append(label, text, btn)
    document.body.prepend(div)
    st.banner = div
  }

  function toast(msg, ms = 4000) {
    let div = document.getElementById('__tenwords_toast')
    if (!div) {
      ensureStyle()
      div = document.createElement('div')
      div.id = '__tenwords_toast'
      document.body.appendChild(div)
    }
    clearTimeout(div.__tenwordsTimer)
    div.textContent = msg
    if (ms > 0) div.__tenwordsTimer = setTimeout(() => div.remove(), ms)
  }

  function clearToast() {
    document.getElementById('__tenwords_toast')?.remove()
  }
})()
