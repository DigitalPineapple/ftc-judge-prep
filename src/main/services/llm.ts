export interface LlmConfig {
  provider: 'azure' | 'openai'
  endpoint: string
  apiKey?: string
  bearer?: string // dev/test only (e.g. an `az` token)
}

function target(cfg: LlmConfig): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey) headers[cfg.provider === 'azure' ? 'api-key' : 'Authorization'] = cfg.provider === 'azure' ? cfg.apiKey : `Bearer ${cfg.apiKey}`
  else if (cfg.bearer) headers.Authorization = `Bearer ${cfg.bearer}`
  else throw new Error('No API key configured. Add one in Settings.')
  const root = cfg.endpoint.trim().replace(/\/+$/, '').replace(/\/openai(\/v1)?$/, '')
  const base = cfg.provider === 'azure' ? `${root}/openai/v1` : 'https://api.openai.com/v1'
  if (cfg.provider === 'azure' && !cfg.endpoint) throw new Error('No Azure endpoint configured. Add one in Settings.')
  return { url: `${base}/chat/completions`, headers }
}

// `model` is the Azure deployment name or the OpenAI model id.
export async function chatJson<T>(cfg: LlmConfig, model: string, system: string, user: string): Promise<T> {
  if (!model) throw new Error('No model configured. Set one in Settings.')
  const { url, headers } = target(cfg)
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4000
    })
  })
  if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const content = (await res.json()).choices?.[0]?.message?.content
  if (!content) throw new Error('LLM returned an empty response')
  return JSON.parse(content) as T
}
