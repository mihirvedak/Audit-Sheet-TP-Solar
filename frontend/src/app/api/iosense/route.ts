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
    // Windowed data + the latest-DP fallback are independent → fetch in parallel
    // so the slower one doesn't stack on top of the other.
    const [data, lastDPs] = await Promise.all([
      fetchSensorsServer(pairs, sTime, eTime, ssoToken),
      fetchLastDPs(pairs, ssoToken),
    ]);
    return Response.json({ data, lastDPs });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    // Auth problems (no/invalid SSO token) are the client's to resolve → 401,
    // not a misleading 502 "bad gateway".
    const isAuth = /sso token|bearer|log|auth|unauthor/i.test(msg);
    return Response.json({ error: msg }, { status: isAuth ? 401 : 502 });
  }
}
