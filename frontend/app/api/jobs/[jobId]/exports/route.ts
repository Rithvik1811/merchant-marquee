import type { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/jobs/${jobId}/exports`);
  } catch (err) {
    return new Response(`Backend unreachable: ${err}`, { status: 502 });
  }

  if (!backendRes.ok) {
    return new Response(`Backend error: ${backendRes.status}`, {
      status: backendRes.status,
    });
  }

  const data = await backendRes.json();
  return Response.json(data);
}
