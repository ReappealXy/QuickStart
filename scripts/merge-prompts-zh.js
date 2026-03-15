/**
 * 从 PlexPt/awesome-chatgpt-prompts-zh 生成仅中文的 builtinPrompts
 *
 * 运行: node scripts/merge-prompts-zh.js
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const ZH_JSON_URL = 'https://raw.githubusercontent.com/PlexPt/awesome-chatgpt-prompts-zh/main/prompts-zh.json'
const ZH_PATH = path.join(__dirname, 'prompts-zh.json')
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'builtinPrompts.ts')

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function main() {
  let zhRaw
  if (fs.existsSync(ZH_PATH)) {
    console.log('Reading local prompts-zh.json...')
    zhRaw = fs.readFileSync(ZH_PATH, 'utf-8')
  } else {
    console.log('Fetching prompts-zh.json...')
    zhRaw = await fetchUrl(ZH_JSON_URL)
    fs.writeFileSync(ZH_PATH, zhRaw, 'utf-8')
  }

  const zhList = JSON.parse(zhRaw.replace(/\n/g, ' '))

  console.log('Chinese prompts:', zhList.length)

  // 仅使用中文提示词：PlexPt prompts-zh.json
  const merged = zhList.map((item, i) => {
    const text = (item.prompt || '').trim().replace(/\n$/, '')
    return {
      name: (item.act || '').trim() || `提示词 ${i + 1}`,
      tag: '通用',
      content: text,
      contentZh: text,  // 原文与译文同为中文
    }
  })

  const tsContent = `export interface BuiltinPrompt {
  name: string
  tag: string
  content: string
  contentZh?: string
}

export const BUILTIN_PROMPTS: BuiltinPrompt[] = ${JSON.stringify(merged, null, 2)}
`

  fs.writeFileSync(OUT_PATH, tsContent, 'utf-8')
  console.log('Written to:', OUT_PATH)
  console.log('Total prompts (Chinese only):', merged.length)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
