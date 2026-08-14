export function truncateText(name: string, maxLen = 16): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen).trimEnd()}…`;
}
