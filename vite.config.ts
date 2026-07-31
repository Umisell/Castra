import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  plugins: [
    {
      name: 'castra-ai-api',
      configureServer(server) {
        server.middlewares.use('/api/ai/cast', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Method not allowed' }))
            return
          }

          const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY
          if (!apiKey) {
            res.statusCode = 501
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'OPENAI_API_KEY belum diset di .env' }))
            return
          }

          try {
            const chunks: Buffer[] = []
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            }

            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
            const draft = String(body.draft || '').slice(0, 800)
            const channel = String(body.channel || '/aptos').slice(0, 32)
            const visibility = String(body.visibility || 'public').slice(0, 32)

            const aiResponse = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: env.OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
                instructions: [
                  'You are Castra Compose AI for an Aptos Testnet social storage dApp.',
                  'Write one polished social cast, maximum 320 characters.',
                  'Keep the language natural, specific, and non-generic.',
                  'Match the user language. Avoid hype, hashtags, emojis, quotes, and markdown.',
                  'If the draft is empty, create a useful short update about encrypted casts, Shelby storage, Aptos identity, or the selected channel.',
                ].join(' '),
                input: `Draft: ${draft || '(empty)'}\nChannel: ${channel}\nVisibility: ${visibility}`,
                max_output_tokens: 120,
              }),
            })

            const payload: any = await aiResponse.json()
            if (!aiResponse.ok) {
              res.statusCode = aiResponse.status
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: payload?.error?.message || 'OpenAI request failed' }))
              return
            }

            const outputText =
              payload.output_text ||
              payload.output?.flatMap((item: any) => item.content || [])
                ?.map((part: any) => part.text || '')
                ?.join('')
                ?.trim()

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ text: String(outputText || '').trim().slice(0, 320) }))
          } catch (error: any) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error?.message || 'AI generator failed' }))
          }
        })
      },
    },
    react(),
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      include: ['buffer', 'process', 'events', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@shelby-protocol/clay-codes']
  }
}
})
