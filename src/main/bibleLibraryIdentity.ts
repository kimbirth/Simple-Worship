import { createHash } from 'crypto'

export interface BiblePackageIdentity {
  packageId: string
  versions: string[]
}

/** A package ID is derived from the complete file, so two files with the same
 * name cannot overwrite each other and identical re-imports are idempotent. */
export function biblePackageId(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Selectors use an opaque package/version ID instead of exposing a file path
 * to the renderer. */
export function bibleTranslationId(packageId: string, version: string): string {
  return createHash('sha256').update(packageId).update('\0').update(version).digest('hex')
}

export function safeBiblePackageStem(version: string): string {
  let safe = version
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) {
    safe = `Bible-${safe}`
  }
  return safe || 'Bible'
}

export function installedBiblePackageName(pkg: BiblePackageIdentity): string {
  return `${safeBiblePackageStem(pkg.versions[0] ?? '')}-${pkg.packageId.slice(0, 12)}.swbible`
}
