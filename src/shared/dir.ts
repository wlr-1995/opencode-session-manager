export function normalizeDir(path: string): string {
  if (!path) return ''
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}
