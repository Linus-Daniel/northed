import { httpRouter } from "convex/server";
import { auth } from "./auth";

/**
 * HTTP routes for the deployment.
 *
 * Convex Auth registers its own routes here (the OAuth callback, the JWKS
 * endpoint and the session endpoints). The password flow does not need them,
 * but they must exist for the library to work and for adding an OAuth
 * provider later.
 */
const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
