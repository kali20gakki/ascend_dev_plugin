/**
 * Minimal reader for the YAML frontmatter used by Agent Skills. The full YAML
 * grammar is out of scope: skills use flat scalar keys plus one level of
 * nested metadata, so the parser handles exactly that and reports nothing it
 * cannot represent.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Split a Markdown document into frontmatter data and body.
 * @param {string} text file content
 * @returns {{ data: Record<string, unknown>, body: string }} parsed parts
 */
export function parseFrontmatter(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  if (lines[0]?.trim() !== '---') return { data: {}, body: normalized }
  let end = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      end = index
      break
    }
  }
  if (end === -1) return { data: {}, body: normalized }
  const front = lines.slice(1, end)
  const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '')
  return { data: parseMapping(front), body }
}

/**
 * Read and interpret one skill directory.
 * @param {string} skillDir directory containing SKILL.md
 * @returns {Promise<object>} skill facts plus validation problems
 */
export async function readSkill(skillDir) {
  const file = path.join(skillDir, 'SKILL.md')
  const text = await readFile(file, 'utf8')
  const { data, body } = parseFrontmatter(text)
  const problems = []
  const name = scalar(data.name)
  const description = scalar(data.description)
  if (!name) problems.push(`${file}: missing frontmatter "name"`)
  else if (!KEBAB_ID.test(name)) problems.push(`${file}: name "${name}" is not kebab-case`)
  if (!description) problems.push(`${file}: missing frontmatter "description"`)
  const invocation = parseInvocation(data, file, problems)
  return {
    file,
    directory: skillDir,
    name,
    description,
    whenToUse: scalar(data.whenToUse ?? data.when_to_use),
    license: scalar(data.license),
    metadata: isRecord(data.metadata) ? data.metadata : {},
    invocation,
    body,
    problems,
  }
}

/** Normalize invocation flags; invalid spellings are reported, not silently accepted. */
function parseInvocation(data, file, problems) {
  const modelFlag = booleanFlag(data['disable-model-invocation'], false)
  const userFlag = booleanFlag(data['user-invocable'], true)
  if (modelFlag === undefined) problems.push(`${file}: "disable-model-invocation" must be a boolean`)
  if (userFlag === undefined) problems.push(`${file}: "user-invocable" must be a boolean`)
  return {
    modelInvocable: modelFlag !== true,
    userInvocable: userFlag !== false,
  }
}

const TRUE = new Set(['true', 'yes', 'on', '1'])
const FALSE = new Set(['false', 'no', 'off', '0'])

function booleanFlag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const text = String(value).trim().toLowerCase()
  if (TRUE.has(text)) return true
  if (FALSE.has(text)) return false
  return undefined
}

function parseMapping(lines) {
  const data = {}
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '' || /^\s*#/.test(line)) {
      index += 1
      continue
    }
    const match = /^([A-Za-z0-9_-]+):(.*)$/.exec(line)
    if (!match) {
      index += 1
      continue
    }
    const key = match[1]
    const raw = match[2].trim()
    if (raw === '') {
      const children = []
      let cursor = index + 1
      while (cursor < lines.length && (/^\s+\S/.test(lines[cursor]) || lines[cursor].trim() === '')) {
        children.push(lines[cursor])
        cursor += 1
      }
      while (children.length > 0 && children[children.length - 1].trim() === '') children.pop()
      data[key] = children.length > 0 ? parseNested(children) : ''
      index = cursor
      continue
    }
    if (/^[|>][+-]?$/.test(raw)) {
      const style = raw[0]
      const block = []
      let cursor = index + 1
      while (cursor < lines.length && (/^\s/.test(lines[cursor]) || lines[cursor] === '')) {
        block.push(lines[cursor])
        cursor += 1
      }
      while (block.length > 0 && block[block.length - 1].trim() === '') block.pop()
      const indents = block.filter(line => line.trim() !== '').map(line => /^\s*/.exec(line)[0].length)
      const indent = indents.length > 0 ? Math.min(...indents) : 0
      const dedented = block.map(line => line.slice(Math.min(indent, line.length)))
      data[key] = style === '>' ? dedented.join(' ').replace(/\s+/g, ' ').trim() : dedented.join('\n')
      index = cursor
      continue
    }
    data[key] = unquote(raw)
    index += 1
  }
  return data
}

function parseNested(lines) {
  const out = {}
  for (const line of lines) {
    if (line.trim() === '') continue
    const match = /^\s+([A-Za-z0-9_-]+):(.*)$/.exec(line)
    if (!match) continue
    const value = match[2].trim()
    out[match[1]] = /^[|>][+-]?$/.test(value) ? value : unquote(value)
  }
  return out
}

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' || first === "'") && first === last) {
      const inner = value.slice(1, -1)
      return first === '"' ? inner.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'")
    }
  }
  return value
}

function scalar(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim()
  return String(value)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
