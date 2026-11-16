/** Small command-line parser: `--flag value`, `--flag=value`, `--boolean`, positionals. */
export function parseArgs(argv) {
  const positionals = []
  const flags = /** @type {Record<string, string | boolean | string[]>} */ ({})
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--') {
      positionals.push(...argv.slice(index + 1))
      break
    }
    if (token.startsWith('--') && token.length > 2) {
      const equals = token.indexOf('=')
      if (equals > 2) {
        record(flags, token.slice(2, equals), token.slice(equals + 1))
        continue
      }
      const name = token.slice(2)
      const next = argv[index + 1]
      if (next !== undefined && !next.startsWith('-')) {
        record(flags, name, next)
        index += 1
      } else {
        record(flags, name, true)
      }
      continue
    }
    if (token.startsWith('-') && token.length > 1) {
      record(flags, token.slice(1), true)
      continue
    }
    positionals.push(token)
  }
  return { positionals, flags }
}

function record(flags, name, value) {
  if (!(name in flags)) {
    flags[name] = value
    return
  }
  const previous = flags[name]
  flags[name] = Array.isArray(previous) ? [...previous, value] : [previous, value]
}

/** Read a string flag; the last occurrence wins. */
export function stringFlag(flags, name) {
  const value = flags[name]
  if (value === undefined || typeof value === 'boolean') return undefined
  return Array.isArray(value) ? value[value.length - 1] : value
}

/** Read a boolean flag. */
export function boolFlag(flags, name) {
  const value = flags[name]
  if (value === undefined) return false
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return true
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase())
}

/** Read a comma-separated or repeated list flag. */
export function listFlag(flags, name) {
  const value = flags[name]
  if (value === undefined || typeof value === 'boolean') return []
  const parts = Array.isArray(value) ? value : [value]
  return parts.flatMap(part => String(part).split(',')).map(part => part.trim()).filter(Boolean)
}

/** Read an integer flag. */
export function numberFlag(flags, name) {
  const value = stringFlag(flags, name)
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}
