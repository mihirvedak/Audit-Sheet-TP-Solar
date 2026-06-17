import { fetchLastDPs, fetchSensorsServer } from "@/lib/iosenseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { pairs: [{devID, sensor}], sTime, eTime } → { data: SensorPoint[] }
// Auth (login + token) happens server-side; the browser never sees a token.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      pairs?: { devID: string; sensor: string }[];
      sTime?: number;
      eTime?: number;
      ssoToken?: string;
    };
    const { pairs, sTime, eTime, ssoToken } = body;
    if (!Array.isArray(pairs) || pairs.length === 0 || !sTime || !eTime) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    // Windowed data first (this also ensures/refreshes the auth token), then
    // the latest data point per sensor as a fallback for empty windows.
    const data = await fetchSensorsServer(pairs, sTime, eTime, ssoToken);
    const lastDPs = await fetchLastDPs(pairs, ssoToken);
    return Response.json({ data, lastDPs });
  } catch (err) {
    return Response.json(
      { error: String((err as Error)?.message ?? err) },
      { status: 502 },
    );
  }
}
