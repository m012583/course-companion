import { env } from 'cloudflare:workers';
export async function GET() {
  return Response.json(
    {
      app: 'course-kb-v2',
      version: 2,
      instance:
        (env as unknown as { COURSE_KB_INSTANCE?: string })
          .COURSE_KB_INSTANCE || 'direct-dev',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
