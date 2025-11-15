import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GithubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

// Almacenamiento en memoria solo para demo
type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
};

const users = new Map<string, User>();

// Intentos fallidos de inicio de sesión por email
const failedAttempts = new Map<string, { count: number; blockedUntil?: number }>();

const MAX_ATTEMPTS = 5;
const BLOCK_TIME_MS = 5 * 60 * 1000; // 5 minutos

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        isRegister: { label: "isRegister", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const email = credentials.email.toLowerCase();
        const now = Date.now();
        const attempts = failedAttempts.get(email);

        if (attempts?.blockedUntil && attempts.blockedUntil > now) {
          throw new Error("Cuenta bloqueada temporalmente por múltiples intentos fallidos");
        }

        const isRegister = credentials.isRegister === "true";

        if (isRegister) {
          if (users.has(email)) {
            throw new Error("El usuario ya existe");
          }

          const passwordHash = await bcrypt.hash(credentials.password, 10);
          const newUser: User = {
            id: email,
            name: email.split("@")[0],
            email,
            passwordHash,
          };
          users.set(email, newUser);
          failedAttempts.delete(email);
          return { id: newUser.id, name: newUser.name, email: newUser.email };
        }

        const user = users.get(email);
        if (!user) {
          const updatedCount = (attempts?.count ?? 0) + 1;
          const updated: { count: number; blockedUntil?: number } = { count: updatedCount };
          if (updatedCount >= MAX_ATTEMPTS) {
            updated.blockedUntil = now + BLOCK_TIME_MS;
          }
          failedAttempts.set(email, updated);
          throw new Error("Credenciales inválidas");
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!isValid) {
          const updatedCount = (attempts?.count ?? 0) + 1;
          const updated: { count: number; blockedUntil?: number } = { count: updatedCount };
          if (updatedCount >= MAX_ATTEMPTS) {
            updated.blockedUntil = now + BLOCK_TIME_MS;
          }
          failedAttempts.set(email, updated);
          throw new Error("Credenciales inválidas");
        }

        failedAttempts.delete(email);
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  pages: {
    signIn: "/signIn",
  },
  session: {
    strategy: "jwt",
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };