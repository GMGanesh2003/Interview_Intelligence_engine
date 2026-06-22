import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * GET /api/auth/token
 *
 * Returns the raw NextAuth-signed JWT from the session cookie.
 * The backend can verify this JWT using the same NEXTAUTH_SECRET (HS256).
 * This is stable for up to 30 days (NextAuth default session maxAge).
 */
export async function GET(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET!,
    raw: true, // returns the raw encoded JWT string, not decoded payload
  });

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ token });
}
