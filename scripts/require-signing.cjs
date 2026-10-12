const platform = process.argv[2]

if (platform !== 'win') {
  console.error(`Unsupported signing check: ${platform || '(missing platform)'}`)
  process.exit(2)
}

const certificate = process.env.WIN_CSC_LINK || process.env.CSC_LINK
const password = process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD
const missing = []

if (!certificate) missing.push('WIN_CSC_LINK (or CSC_LINK)')
if (!password) missing.push('WIN_CSC_KEY_PASSWORD (or CSC_KEY_PASSWORD)')

if (missing.length > 0) {
  console.error('Signed Windows packaging requires:')
  for (const name of missing) console.error(`  - ${name}`)
  console.error('Set the variables only in the current shell or CI secret store; do not commit certificates or passwords.')
  console.error('Use "npm run build:win:unsigned" only for a local, non-release test package.')
  process.exit(1)
}

console.log('Windows signing inputs are present. The certificate and password were not printed.')
