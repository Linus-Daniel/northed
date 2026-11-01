/**
 * Tells the Convex backend which identity provider it may trust.
 *
 * `CONVEX_SITE_URL` is set automatically for every deployment by Convex.
 */
const authConfig = {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
