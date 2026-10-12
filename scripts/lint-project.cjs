const { readFileSync, readdirSync, statSync } = require('node:fs')
const { extname, join, relative } = require('node:path')

const root = join(__dirname, '..')
const roots = ['src', 'scripts', 'tests', '.github']
const rootFiles = [
  '.gitignore',
  'CHANGELOG.md',
  'electron-builder.yml',
  'electron.vite.config.ts',
  'package.json',
  'README.md',
  'RELEASE-CHECKLIST.md',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.web.json'
]
const checkedExtensions = new Set(['.bat', '.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.yml', '.yaml'])
const files = rootFiles.map(file => join(root, file))

function collect(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) collect(path)
    else if (checkedExtensions.has(extname(entry))) files.push(path)
  }
}

for (const directory of roots) {
  const path = join(root, directory)
  if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) collect(path)
}

const problems = []
for (const file of files) {
  const label = relative(root, file).replace(/\\/g, '/')
  const content = readFileSync(file, 'utf8')
  const lines = content.split(/\r?\n/)

  if (content.includes('\0')) problems.push(`${label}: contains a NUL byte`)
  if (content.length > 0 && !content.endsWith('\n')) problems.push(`${label}: missing final newline`)

  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) problems.push(`${label}:${index + 1}: trailing whitespace`)
    if (/^(<{7}|={7}|>{7})(?: |$)/.test(line)) problems.push(`${label}:${index + 1}: unresolved merge marker`)
  })
}

try {
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
} catch (error) {
  problems.push(`package.json: invalid JSON (${error.message})`)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}

console.log(`Lint passed (${files.length} text files checked).`)
