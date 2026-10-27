export function serverHost(server: string): string {
  return server.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
