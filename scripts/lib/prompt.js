/** Interactive prompts for the installer. Everything returns a value; the caller decides defaults. */
import readline from 'node:readline/promises'

/** @returns {boolean} whether prompts can run */
export function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

/**
 * Create a readline-backed prompter.
 * @returns {{ ask: Function, chooseMany: Function, chooseOne: Function, confirm: Function, close: Function }}
 */
export function createPrompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return {
    ask: (question, defaultValue) => ask(rl, question, defaultValue),
    chooseMany: (title, options, defaults) => chooseMany(rl, title, options, defaults),
    chooseOne: (title, options, defaultIndex = 0) => chooseOne(rl, title, options, defaultIndex),
    confirm: (question, defaultYes = true) => confirm(rl, question, defaultYes),
    close: () => rl.close(),
  }
}

async function ask(rl, question, defaultValue) {
  const suffix = defaultValue === undefined ? '' : ` [${defaultValue}]`
  const answer = (await rl.question(`${question}${suffix}: `)).trim()
  return answer === '' ? defaultValue : answer
}

async function chooseMany(rl, title, options, defaults) {
  console.log(`\n${title}`)
  options.forEach((option, index) => {
    const mark = defaults.includes(option.value) ? 'x' : ' '
    console.log(`  ${String(index + 1).padStart(2)}) [${mark}] ${option.label}${option.note ? ` — ${option.note}` : ''}`)
  })
  const answer = (await rl.question('Select (numbers/ranges, "all", "none"; Enter keeps current): ')).trim()
  if (answer === '') return [...defaults]
  return parseSelection(answer, options).map(index => options[index].value)
}

async function chooseOne(rl, title, options, defaultIndex) {
  console.log(`\n${title}`)
  options.forEach((option, index) => {
    console.log(`  ${index + 1}) ${option.label}${option.note ? ` — ${option.note}` : ''}`)
  })
  const answer = (await rl.question(`Choice [${defaultIndex + 1}]: `)).trim()
  if (answer === '') return options[defaultIndex].value
  const index = Number.parseInt(answer, 10) - 1
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return options[defaultIndex].value
  return options[index].value
}

async function confirm(rl, question, defaultYes) {
  const answer = (await rl.question(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'}: `)).trim().toLowerCase()
  if (answer === '') return defaultYes
  return answer === 'y' || answer === 'yes'
}

/**
 * Parse an interactive selection such as `1,3-5`, `all` or `none`.
 * @param {string} input raw user input
 * @param {number | object[]} options option count or option objects
 * @returns {number[]} sorted, unique, zero-based indexes
 */
export function parseSelection(input, options) {
  const count = Array.isArray(options) ? options.length : options
  const text = String(input).trim().toLowerCase()
  if (text === 'all' || text === 'a' || text === '*') return range(0, count)
  if (text === 'none' || text === 'n' || text === '') return []
  const picked = new Set()
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    if (token === 'all' || token === 'a') {
      for (let index = 0; index < count; index += 1) picked.add(index)
      continue
    }
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(token)
    if (rangeMatch) {
      const from = Number.parseInt(rangeMatch[1], 10)
      const to = Number.parseInt(rangeMatch[2], 10)
      for (let value = Math.min(from, to); value <= Math.max(from, to); value += 1) {
        if (value >= 1 && value <= count) picked.add(value - 1)
      }
      continue
    }
    const value = Number.parseInt(token, 10)
    if (Number.isInteger(value) && value >= 1 && value <= count) picked.add(value - 1)
  }
  return [...picked].sort((a, b) => a - b)
}

function range(from, to) {
  return Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index)
}
