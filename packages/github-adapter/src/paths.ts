export function safeRepositoryPath(path: string) {
  return (
    path.length <= 4096 &&
    !path.includes('\\') &&
    !path.startsWith('/') &&
    !path.split('/').some((p) => !p || p === '.' || p === '..') &&
    !/[\x00-\x1f\x7f]/.test(path)
  );
}
export const excludedRepositoryPath = (p: string) =>
  /(^|\/)(?:\.git|node_modules|\.env(?:\..*)?|\.npmrc|\.yarnrc|\.ssh|coverage|\.DS_Store)(\/|$)|\.(?:pem|key|p12|pfx)$/i.test(
    p,
  );
