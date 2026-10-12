const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

const required = process.argv.includes('--required')
const packageDirectory = join(__dirname, '..', 'node_modules', 'electron')
const installer = join(packageDirectory, 'install.js')

if (!existsSync(installer)) {
  const message = 'Electron is not installed (expected it in devDependencies).'
  if (required) {
    console.error(message)
    process.exit(1)
  }

  console.log(`${message} Skipping its binary download for a production-only install.`)
  process.exit(0)
}

const result = spawnSync(process.execPath, [installer], {
  cwd: packageDirectory,
  stdio: 'inherit'
})

if (result.error) {
  console.error(`Unable to start Electron's installer: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
