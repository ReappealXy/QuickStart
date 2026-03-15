const fs = require('fs')
const path = require('path')

const csvPath = path.join(
  'C:', 'Users', '13528', '.cursor', 'projects',
  'f-xaiohaha', 'agent-tools',
  'ef5d1543-8caf-44d6-8540-c49d89f95dd7.txt'
)

const raw = fs.readFileSync(csvPath, 'utf-8')

const TAG_MAP = {
  TRUE: '开发',
  FALSE: '通用',
}

function parseCSV(text) {
  const results = []
  const lines = text.split('\n')
  let i = 1

  while (i < lines.length) {
    let line = lines[i].trim()
    if (!line) { i++; continue }

    const firstComma = line.indexOf(',')
    if (firstComma === -1) { i++; continue }

    let act = line.substring(0, firstComma).replace(/^"|"$/g, '')
    let rest = line.substring(firstComma + 1)

    if (rest.startsWith('"')) {
      let promptText = rest.substring(1)
      while (i < lines.length) {
        const endMatch = promptText.match(/",(TRUE|FALSE),(TEXT|CODE),/)
        if (endMatch) {
          const idx = promptText.indexOf(endMatch[0])
          const prompt = promptText.substring(0, idx).replace(/""/g, '"')
          const forDevs = endMatch[1]
          results.push({
            name: act,
            tag: TAG_MAP[forDevs] || '通用',
            content: prompt.trim(),
          })
          break
        }
        i++
        if (i < lines.length) {
          promptText += '\n' + lines[i].trim()
        }
      }
    }
    i++
  }
  return results
}

const prompts = parseCSV(raw)
console.log('Total parsed:', prompts.length)
console.log('Sample:', JSON.stringify(prompts.slice(0, 2), null, 2))

const outPath = path.join(__dirname, '..', 'src', 'data', 'builtinPrompts.ts')
const dir = path.dirname(outPath)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

const tsContent = `export interface BuiltinPrompt {
  name: string
  tag: string
  content: string
}

export const BUILTIN_PROMPTS: BuiltinPrompt[] = ${JSON.stringify(prompts, null, 2)}
`

fs.writeFileSync(outPath, tsContent, 'utf-8')
console.log('Written to:', outPath)
