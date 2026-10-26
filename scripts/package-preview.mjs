import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function isReleaseEntry(name) {
  if (name.split('/').some(part => part.startsWith('.') || ['node_modules', 'design', 'test-results'].includes(part))) return false
  return /^(manifest\.json|service-worker-loader\.js|content-extractor\.js|privacy(?:-chrome|-edge)?\.html|_locales\/[\w-]+\/messages\.json|src\/(newtab|options|popup)\/index\.html|icons\/[\w.-]+\.(png|svg)|assets\/[\w.-]+\.(js|css))$/.test(name)
}

async function filesIn(root, prefix = '') {
  const result = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory()) result.push(...await filesIn(root, name + '/'))
    else if (entry.isFile()) result.push(name)
    else throw new Error(`Unsupported release entry: ${name}`)
  }
  return result.sort()
}

async function packagePreview(output) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const dist = join(root, 'dist')
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'))
  if (manifest.version !== pkg.version) throw new Error('Build version does not match package.json; rebuild first')
  const files = await filesIn(dist)
  for (const name of files) if (!isReleaseEntry(name)) throw new Error(`Not a production runtime file: ${name}`)
  const required = ['manifest.json', 'content-extractor.js', 'privacy.html', 'privacy-chrome.html', 'privacy-edge.html', `_locales/${manifest.default_locale}/messages.json`, manifest.background.service_worker, manifest.action.default_popup, manifest.chrome_url_overrides.newtab, manifest.options_ui.page, ...Object.values(manifest.icons)]
  for (const name of required) if (!files.includes(name)) throw new Error(`Missing runtime entry: ${name}`)

  // Retain the complete installed license text, including transitive runtime dependencies.
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
  const notices = ['DJS321 Tabs preview - bundled third-party software notices\n']
  for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!path || entry.dev || entry.link) continue
    const location = join(root, path)
    const dependency = JSON.parse(await readFile(join(location, 'package.json'), 'utf8'))
    const licenses = (await readdir(location)).filter(name => /^(licen[cs]e|copying)(\.|$)/i.test(name)).sort()
    if (!licenses.length) throw new Error(`Missing license for ${dependency.name}`)
    notices.push(`\n=== ${dependency.name}@${dependency.version} (${dependency.license || 'see license'}) ===\n`)
    for (const name of licenses) notices.push(await readFile(join(location, name), 'utf8'))
  }
  const stage = await mkdtemp(join(tmpdir(), 'djs321-tabs-preview-'))
  const target = resolve(output)
  try {
    for (const name of files) {
      await mkdir(dirname(join(stage, name)), { recursive: true })
      await cp(join(dist, name), join(stage, name))
    }
    await cp(join(root, 'docs/PREVIEW_INSTALL.md'), join(stage, 'INSTALL.md'))
    await writeFile(join(stage, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n'))
    await mkdir(dirname(target), { recursive: true })
    // Refuse to update an existing ZIP, which could retain obsolete entries.
    const archiveFiles = [...files, 'INSTALL.md', 'THIRD-PARTY-NOTICES.txt'].sort()
    await writeFile(target, '', { flag: 'wx' })
    await rm(target)
    execFileSync('zip', ['-X', '-q', target, ...archiveFiles], { cwd: stage })
    execFileSync('unzip', ['-t', target])
    const bytes = await readFile(target)
    return { version: pkg.version, channel: 'preview', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/package-preview.mjs /absolute/path/preview.zip (run npm run build first)')
  console.log(JSON.stringify(await packagePreview(process.argv[2]), null, 2))
}
