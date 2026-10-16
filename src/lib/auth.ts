import { isAuthenticated } from "./session";

/** Para rutas API: cookie de sesión o `Authorization: Bearer <SYNC_SECRET>`. */
export function isAuthorized(req: Request): Promise<boolean> {
  return isAuthenticated(req);
}
