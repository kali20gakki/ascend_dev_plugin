/** Small filesystem helpers shared by the scripts and tests. */
import { access, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export { mkdir }

/** @returns {Promise<boolean>} whether the path exists */
export async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/** Read a UTF-8 text file, or return undefined when it is absent. */
export async function readTextIfExists(file) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

/** Write a UTF-8 file with LF endings, creating parent directories. */
export async function writeText(file, content) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content.replace(/\r\n/g, '\n'), 'utf8')
}

/** Read and parse JSON, or return undefined when the file is absent. */
export async function readJsonIfExists(file) {
  const text = await readTextIfExists(file)
  return text === undefined ? undefined : JSON.parse(text)
}

/** Remove a file or directory tree when present. */
export async function removeIfExists(target) {
  await rm(target, { recursive: true, force: true })
}

/** List direct child directories of a directory, sorted by name. */
export async function listDirectories(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const out = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const isDirectory = entry.isDirectory() || (entry.isSymbolicLink() && await isDirectoryPath(full))
    if (isDirectory) out.push(full)
  }
  return out.sort()
}

/** List direct child entries (files and directories) of a directory. */
export async function listEntries(dir) {
  try {
    return (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

/** Recursively copy a directory tree. */
export async function copyTree(from, to) {
  const info = await stat(from)
  if (info.isDirectory()) {
    await mkdir(to, { recursive: true })
    for (const entry of await readdir(from)) {
      if (entry === '.git') continue
      await copyTree(path.join(from, entry), path.join(to, entry))
    }
    return
  }
  await mkdir(path.dirname(to), { recursive: true })
  await copyFile(from, to)
}

async function isDirectoryPath(target) {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}
