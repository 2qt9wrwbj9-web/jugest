// In the owner trial the Worker intercepts this route before framework dispatch.
export function GET() {
  return new Response(null, {status: 404, headers: {'cache-control': 'no-store'}});
}
