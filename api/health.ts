export function GET() {
  return Response.json({ status: 'ok', service: 'smart-midas-steel', time: new Date().toISOString() })
}
