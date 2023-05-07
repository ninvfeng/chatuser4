// #vercel-disable-blocks
import { ProxyAgent, fetch } from 'undici'
// #vercel-end
import { generatePayload, parseOpenAIStream } from '@/utils/openAI'
import { verifySignature } from '@/utils/auth'
import type { APIRoute } from 'astro'

const apiKey = import.meta.env.OPENAI_API_KEY
const httpsProxy = import.meta.env.HTTPS_PROXY
const baseUrl = ((import.meta.env.OPENAI_API_BASE_URL) || 'https://api.openai.com').trim().replace(/\/$/, '')
const sitePassword = import.meta.env.SITE_PASSWORD
const API_URL = import.meta.env.API_URL

export const post: APIRoute = async(context) => {
  const body = await context.request.json()
  const { sign, time, messages, pass, token } = body
  if (!messages) {
    return new Response(JSON.stringify({
      error: {
        message: 'No input text.',
      },
    }), { status: 400 })
  }
  if (sitePassword && sitePassword !== pass) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid password.',
      },
    }), { status: 401 })
  }
  if (import.meta.env.PROD && !await verifySignature({ t: time, m: messages?.[messages.length - 1]?.content || '' }, sign)) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid signature.',
      },
    }), { status: 401 })
  }

  // 消耗次数
  let word_num = 0
  messages.forEach((v) => {
    word_num += v.content.length
  })
  const useRes = await fetch(`${API_URL}/api/gpt/consumeWord`, {
    headers: {
      'Content-Type': 'application/json',
      'Token': token,
    },
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-4',
      type: 'ask',
      word_num,
      app_key: import.meta.env.APP_KEY,
    }),
  })
  const res = await useRes.text()
  const resJson = JSON.parse(res)
  if (resJson.code !== 200)
    return new Response(resJson.message)

  messages.unshift({
    role: 'system',
    content: '你是GPT4,比GPT3更聪明,请认真思考后回答',
  })

  const initOptions = generatePayload(apiKey, messages)
  // #vercel-disable-blocks
  if (httpsProxy)
    initOptions.dispatcher = new ProxyAgent(httpsProxy)
  // #vercel-end

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const response = await fetch(`${baseUrl}/v1/chat/completions`, initOptions).catch((err: Error) => {
    console.error(err)
    return new Response(JSON.stringify({
      error: {
        code: err.name,
        message: err.message,
      },
    }), { status: 500 })
  }) as Response

  return parseOpenAIStream(response) as Response
}
