import MarkdownIt from 'markdown-it'
import katex from 'katex'

// 支持 LaTeX：块级 $$...$$ 和行内 $...$。
// markdown-it 不原生支持，这里用自定义 inline rule 处理行内，
// 块级用 fence 包裹的 $$...$$ 方案太复杂，改用正则预处理。
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
})

// 行内 $...$ 渲染为 KaTeX。
md.inline.ruler.before('escape', 'katex_inline', (state, silent) => {
  const pos = state.pos
  const src = state.src
  if (src[pos] !== '$') return false
  // 避免把 $$ 当行内。
  if (src[pos + 1] === '$') return false
  const end = src.indexOf('$', pos + 1)
  if (end < 0) return false
  const tex = src.slice(pos + 1, end).trim()
  if (!tex) return false
  if (!silent) {
    let html: string
    try {
      html = katex.renderToString(tex, { throwOnError: false })
    } catch {
      html = tex
    }
    const token = state.push('html_inline', '', 0)
    token.content = html
    token.markup = '$'
  }
  state.pos = end + 1
  return true
})

export function renderMarkdown(src: string): string {
  // 先处理块级 $$...$$（可跨行）。
  let html = src.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
    try {
      return `<div class="katex-block">${katex.renderToString(tex.trim(), {
        displayMode: true,
        throwOnError: false
      })}</div>`
    } catch {
      return `$$${tex}$$`
    }
  })
  html = md.render(html)
  return html
}

export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
