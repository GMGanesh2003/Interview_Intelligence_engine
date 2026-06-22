import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "Guest",
      credentials: {},
      async authorize() {
        return { id: "guest", name: "Guest User", email: "guest@example.com" };
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account, user, profile }) {
      // On initial sign in, store relevant info on the token
      if (account?.provider === "google") {
        token.provider = "google";
        // Store Google id_token as well (may be useful)
        token.idToken = account.id_token;
      } else if (user?.id === "guest") {
        token.provider = "guest";
        // Guest users get a static token recognized by backend
        token.sub = "guest";
        token.email = "guest@example.com";
        token.name = "Guest User";
      }
      return token;
    },
    async session({ session, token }) {
      // Expose the provider so frontend knows which flow was used
      (session as any).provider = token.provider;
      // Expose the raw google id_token for reference
      (session as any).idToken = token.idToken;
      // Expose the NextAuth sub (user ID)
      (session as any).userId = token.sub;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
