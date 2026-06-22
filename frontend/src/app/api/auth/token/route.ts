import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../[...nextauth]/route";
import { SignJWT } from "jose";

/**
 * GET /api/auth/token
 *
 * Creates a fresh, short-lived JWT (HS256) signed with NEXTAUTH_SECRET
 * that contains the user's identity (sub, email, name).
 * The backend verifies this token with the same shared secret.
 *
 * Why not use the NextAuth session cookie directly?
 * - NextAuth v4 encrypts session cookies as JWE (not plain JWT), so the
 *   backend cannot decode them with a simple jwt.decode().
 * - This endpoint bridges NextAuth's encrypted session into a plain JWT
 *   the backend can verify.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const secret = new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET || "super_secret_interview_engine_key_12345"
  );

  // Build the sub: guest users get "guest", Google users get their email as ID
  const sub = (session as any).userId || session.user.email || "unknown";
  const isGuest = sub === "guest" || session.user.email === "guest@example.com";

  if (isGuest) {
    return NextResponse.json({ token: "guest_token_123" });
  }

  // Sign a fresh JWT with user identity — valid for 2 hours
  const token = await new SignJWT({
    sub,
    email: session.user.email,
    name: session.user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);

  return NextResponse.json({ token });
}
