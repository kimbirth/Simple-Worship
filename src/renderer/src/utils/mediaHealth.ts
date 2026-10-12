import type { MediaValidationReport } from '../types'

function normalizedPath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

export function isMissingMediaPath(report: MediaValidationReport, path: string): boolean {
  if (!path) return false
  const target = normalizedPath(path)
  return report.issues.some(issue => normalizedPath(issue.path) === target)
}
