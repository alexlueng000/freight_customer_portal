import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const authenticated = this.requestContext.requireAuthenticated();
    const granted = await this.prisma.permission.findMany({
      where: {
        code: { in: required },
        roles: {
          some: {
            role: {
              tenantId: authenticated.tenantId,
              userRoles: { some: { userId: authenticated.userId } },
            },
          },
        },
      },
      select: { code: true },
    });
    const grantedCodes = new Set(granted.map(({ code }) => code));
    const missing = required.filter((permission) => !grantedCodes.has(permission));
    if (missing.length) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'You do not have permission to perform this action',
        details: { required },
      });
    }

    return true;
  }
}
