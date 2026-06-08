import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthedRequest } from "./auth.guard.js";

export type Role = "admin" | "editor" | "viewer";

export const ROLES_KEY = "roles";
/** Restrict a route/controller to the listed roles. Use with AuthGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Rank so a higher role satisfies a lower requirement (admin ⊇ editor ⊇ viewer). */
const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const role = (req.user?.role ?? "viewer") as Role;
    const needed = Math.min(...required.map((r) => RANK[r]));
    if (RANK[role] < needed) {
      throw new ForbiddenException(`requires role: ${required.join(" or ")}`);
    }
    return true;
  }
}
