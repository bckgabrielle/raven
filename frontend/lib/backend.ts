export function getBackendUrl(path: string): string {
  const baseUrl = (process.env.ASL_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
  return `${baseUrl}${path}`;
}
