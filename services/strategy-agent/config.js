import dotenv from 'dotenv'

dotenv.config()

function numberEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const env = {
  AGENT_PORT: numberEnv('AGENT_PORT', 8790),
  AGENT_MODEL_BASE_URL: process.env.AGENT_MODEL_BASE_URL || 'https://api.openai.com/v1',
  AGENT_MODEL_NAME: process.env.AGENT_MODEL_NAME || 'gpt-5.4-nano',
  AGENT_MODEL_API_KEY: process.env.AGENT_MODEL_API_KEY || '',
  AGENT_MODEL_TIMEOUT_MS: numberEnv('AGENT_MODEL_TIMEOUT_MS', 60_000),
}
