import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env } from './config.js'
import { agentRequestSchema, StrategyAgentService } from './agentService.js'

const app = Fastify({
  logger: true,
  connectionTimeout: 600_000,
  requestTimeout: 600_000,
})

await app.register(cors, { origin: true })

const service = new StrategyAgentService({
  modelBaseUrl: env.AGENT_MODEL_BASE_URL,
  modelName: env.AGENT_MODEL_NAME,
  modelApiKey: env.AGENT_MODEL_API_KEY,
  modelTimeoutMs: env.AGENT_MODEL_TIMEOUT_MS,
})

app.get('/agent/health', async () => service.health())

app.post('/agent/strategy/run', async (request, reply) => {
  const parsed = agentRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    reply.code(422)
    return {
      ok: false,
      error: {
        message: 'Invalid agent strategy request.',
        issues: parsed.error.issues,
      },
    }
  }

  return {
    ok: true,
    result: await service.run(parsed.data),
  }
})

app.post('/agent/strategy/run/stream', async (request, reply) => {
  const parsed = agentRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    reply.code(422)
    return {
      ok: false,
      error: {
        message: 'Invalid agent strategy request.',
        issues: parsed.error.issues,
      },
    }
  }

  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.hijack()

  const send = (event, data) => {
    reply.raw.write(`event: ${event}\n`)
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    send('status', { type: 'status', message: 'Running strategy agent...' })
    const result = await service.run(parsed.data, {
      onEvent: (event, data) => send(event, data),
    })
    send('done', { type: 'done', result })
  } catch (error) {
    send('error', {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    reply.raw.end()
  }
})

app.listen({ host: '0.0.0.0', port: env.AGENT_PORT })
