import { publicAiSettings } from '@/lib/ai-provider';
export function GET() {
  return Response.json(publicAiSettings(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
