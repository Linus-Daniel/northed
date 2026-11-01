import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

/**
 * Convex Auth configuration.
 *
 * NorthEd uses the official Convex Auth library with the email + password
 * provider:
 *
 *  - passwords are hashed with scrypt inside the library, no plaintext is ever
 *    stored and there is no password field on the `users` table,
 *  - the authenticated identity is the `users` document, so the application
 *    profile can never drift away from the login,
 *  - `ctx.auth.getUserIdentity()` is what every protected function uses to
 *    resolve the caller.
 *
 * The deployment needs three environment variables (see README):
 * `JWT_PRIVATE_KEY`, `JWKS` and `CONVEX_SITE_URL`. `npx convex dev` and
 * `scripts/setup-auth-keys.mjs` take care of them.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      /**
       * Normalise the profile that is stored for a new account.
       *
       * This runs for every flow (sign up *and* sign in), so the e-mail
       * address is lower-cased consistently on both sides — otherwise
       * `Alice@example.com` and `alice@example.com` would be two different
       * accounts.
       *
       * Only `email` and `name` are ever taken from the request. The role is
       * never part of this object, so a client cannot make itself a tutor.
       */
      profile: (params) => {
        const email =
          typeof params.email === "string" ? params.email.trim().toLowerCase() : "";

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error("Please enter a valid e-mail address.");
        }

        const requestedName =
          typeof params.name === "string" ? params.name.trim() : "";

        return {
          email,
          name:
            requestedName.length > 0
              ? requestedName.slice(0, 80)
              : (email.split("@")[0] ?? "Learner"),
        };
      },
    }),
  ],
});
