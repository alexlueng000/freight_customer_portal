import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { TokenService } from './token.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'A valid Bearer access token is required',
      });
    }

    const claims = this.tokens.verifyAccessToken(match[1]);
    const user = await this.auth.getAuthenticatedUser(claims.tenantId, claims.sub);
    this.requestContext.setAuthenticatedContext({
      tenantId: user.tenantId,
      userId: user.id,
      customerCompanyId: user.customerCompanyId,
      roles: user.roles,
    });
    return true;
  }
}
