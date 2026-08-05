import { getSettings } from './settings'
import { addHotword } from './db'

export interface NoteGeneration {
  markdown: string
  terms: string[]
}

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'

/** 一键生成 Markdown 课堂笔记，并返回待回填热词的术语。 */
export async function generateNoteMarkdown(
  transcript: string,
  hotwords: string[],
  title: string
): Promise<NoteGeneration> {
  const cfg = getSettings()
  if (!cfg.deepseekKey) throw new Error('请先在设置中配置 DeepSeek API Key')

  const sb: string[] = []
  sb.push('请根据下面的课堂转写内容，整理成一篇完整的 Markdown 课堂笔记。')
  sb.push(`笔记标题：${title}`)
  sb.push('注意：这是语音转写结果，可能含有同音错字。')
  if (hotwords.length) {
    sb.push(`遇到与以下术语读音相近的内容时，应优先判断并更正为本术语：${hotwords.join('、')}`)
  }
  sb.push('要求：')
  sb.push('- 用 Markdown 组织：一级标题为笔记标题，使用 ## 分节（核心内容、重点考点、术语解释等）。')
  sb.push('- 提炼老师强调的重点、考点，用列表呈现。')
  sb.push('- 涉及公式可用 LaTeX：行内 $...$、块级 $$...$$。')
  sb.push('- 口语化内容书面化，去除口头禅。')
  sb.push('- 不要遗漏关键知识点。')
  sb.push('请仅返回一个 JSON 对象，字段：')
  sb.push('{"markdown": "完整笔记正文（Markdown）", "terms": ["本课出现的专业术语，用于热词库，每个不少于2字"]}')
  sb.push('不要输出 JSON 以外的任何内容。')
  sb.push('\n以下是转写全文：\n')
  sb.push(transcript)

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.deepseekKey}`
    },
    body: JSON.stringify({
      model: cfg.deepseekModel || 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是专业的课堂笔记整理助手。' },
        { role: 'user', content: sb.join('\n') }
      ],
      temperature: 0.3,
      stream: false,
      response_format: { type: 'json_object' }
    })
  })

  if (!resp.ok) {
    throw new Error(`DeepSeek 请求失败（${resp.status}）：${await resp.text()}`)
  }
  const data = (await resp.json()) as {
    choices: { message: { content: string } }[]
  }
  const content = data.choices?.[0]?.message?.content ?? ''
  const cleaned = content.replace(/```json|```/g, '').trim()
  let jsonBody: { markdown?: string; terms?: unknown[] }
  try {
    jsonBody = JSON.parse(cleaned)
  } catch {
    throw new Error('DeepSeek 返回的不是有效 JSON')
  }
  return {
    markdown: jsonBody.markdown ?? '',
    terms: (jsonBody.terms ?? []).map((e) => String(e))
  }
}

/** 术语回填科目热词库（热词自进化）。返回新增数量。 */
export function harvestTerms(subjectId: string, terms: string[]): number {
  let added = 0
  for (const t of terms) {
    const w = t.trim()
    if (w.length < 2) continue
    if (addHotword(subjectId, w)) added++
  }
  return added
}
