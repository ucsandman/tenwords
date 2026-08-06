import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { summarizeBlocks } from './summarizer.js'

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
    try {
      res.json(await summarizeBlocks(blocks, client))
    } catch (err) {
      console.error('summarize failed:', err)
      res.status(502).json({ error: `summarization failed: ${err.message}` })
    }
  })

  return app
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason)
    process.exit(1)
  })
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY missing. Copy .env.example to .env and set it.')
    process.exit(1)
  }
  const port = Number(process.env.PORT) || 4710
  const server = createApp(new Anthropic()).listen(port, () => {
    console.log(`TenWords service running on http://localhost:${port}`)
  })
  server.on('error', (err) => {
    console.error(`Failed to start on port ${port}: ${err.message}`)
    process.exit(1)
  })
}
