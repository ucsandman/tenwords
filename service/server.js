import dotenv from 'dotenv'

dotenv.config({ override: true, quiet: true })
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import { summarizeBlocks } from './summarizer.js'
import { createClient, resolveProvider } from './providers.js'
import { extractUrl, extractFile, paragraphsFromText, toBlocks } from './extract.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export function createApp(client) {
  const app = express()
  app.use(express.json({ limit: '5mb' }))
  app.use(express.static(path.join(HERE, '..', 'webapp')))

  app.post('/summarize', async (req, res) => {
    const blocks = req.body?.blocks
    if (!Array.isArray(blocks) || blocks.length === 0 ||
        !blocks.every(b => b && typeof b.id === 'string' && typeof b.text === 'string')) {
      return res.status(400).json({ error: 'blocks must be a non-empty array of {id, text}' })
    }
    if (!(req.headers.accept || '').includes('application/x-ndjson')) {
      try {
        return res.json(await summarizeBlocks(blocks, client))
      } catch (err) {
        console.error('summarize failed:', err)
        return res.status(502).json({ error: `summarization failed: ${err.message}` })
      }
    }
    res.setHeader('Content-Type', 'application/x-ndjson')
    const send = event => res.write(JSON.stringify(event) + '\n')
    try {
      await summarizeBlocks(blocks, client, send)
      send({ type: 'done' })
    } catch (err) {
      console.error('summarize failed:', err)
      send({ type: 'error', error: `summarization failed: ${err.message}` })
    }
    res.end()
  })

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

  app.post('/extract', upload.single('file'), async (req, res) => {
    try {
      if (req.file) {
        return res.json({ blocks: await extractFile(req.file.buffer, req.file.originalname) })
      }
      if (typeof req.body?.url === 'string' && req.body.url.trim()) {
        return res.json({ blocks: await extractUrl(req.body.url.trim()) })
      }
      if (typeof req.body?.text === 'string' && req.body.text.trim()) {
        return res.json({ blocks: toBlocks(paragraphsFromText(req.body.text)) })
      }
      res.status(400).json({ error: 'provide a file upload, a {url}, or pasted {text}' })
    } catch (err) {
      console.error('extract failed:', err)
      res.status(422).json({ error: `extraction failed: ${err.message}` })
    }
  })

  app.use((err, req, res, next) => {
    console.error('request failed:', err)
    res.status(err.status ?? 400).json({ error: err.message })
  })

  return app
}

// The Anthropic SDK stays the transport for the anthropic dialect (it brings
// retries and timeouts); every other provider goes through the shared fetch
// client in providers.js.
function makeClient(config) {
  if (config.dialect !== 'anthropic') {
    return createClient(config, { keyHelp: ` — check ${config.keyVar} in .env` })
  }
  const sdk = new Anthropic({ apiKey: config.apiKey })
  return {
    dialect: config.dialect,
    model: config.model,
    tokenParam: config.tokenParam,
    messages: { create: body => sdk.messages.create(body) },
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason)
    process.exit(1)
  })
  let config
  try {
    config = resolveProvider({
      provider: process.env.PROVIDER,
      model: process.env.MODEL,
      baseUrl: process.env.BASE_URL,
    })
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
  config.apiKey = process.env[config.keyVar] || ''
  if (!config.apiKey) {
    console.error(`${config.keyVar} missing for PROVIDER=${config.provider}. Copy .env.example to .env and set it.`)
    process.exit(1)
  }
  const port = Number(process.env.PORT) || 4710
  const server = createApp(makeClient(config)).listen(port, '127.0.0.1', () => {
    console.log(`TenWords service running on http://localhost:${port} (${config.provider} / ${config.model})`)
  })
  server.on('error', (err) => {
    console.error(`Failed to start on port ${port}: ${err.message}`)
    process.exit(1)
  })
}
