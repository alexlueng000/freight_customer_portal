import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { AuthService } from './auth.service.js';
import type { AuthResponse, IssuedAuthSession, SessionMetadata } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from './public.decorator.js';

const refreshCookieName = 'freight_refresh';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {
    this.secureCookies = this.config.getOrThrow<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ description: 'Authenticated user and short-lived access token' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or inactive account' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.login(dto, this.getMetadata(request));
    this.setRefreshCookie(response, session);
    return this.withoutRefreshToken(session);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOkResponse({ description: 'Rotated refresh session and a new access token' })
  @ApiUnauthorizedResponse({ description: 'Refresh session is invalid or expired' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const refreshToken = this.readRefreshCookie(request);
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REQUIRED',
        message: 'Refresh token cookie is required',
      });
    }

    const session = await this.auth.refresh(refreshToken, this.getMetadata(request));
    this.setRefreshCookie(response, session);
    return this.withoutRefreshToken(session);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(request), this.getMetadata(request));
    response.clearCookie(refreshCookieName, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Current authenticated user' })
  async me(): Promise<AuthResponse['user']> {
    const context = this.requestContext.get();
    if (!context?.tenantId || !context.userId) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }
    return this.auth.getAuthenticatedUser(context.tenantId, context.userId);
  }

  private setRefreshCookie(response: Response, session: IssuedAuthSession): void {
    response.cookie(refreshCookieName, session.refreshToken, {
      ...this.cookieOptions(),
      maxAge: session.refreshTokenExpiresIn * 1000,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      path: '/api/v1/auth',
      sameSite: 'strict' as const,
      secure: this.secureCookies,
    };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookieHeader = request.header('cookie');
    if (!cookieHeader) return undefined;

    for (const part of cookieHeader.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;
      const name = part.slice(0, separator).trim();
      if (name !== refreshCookieName) continue;
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private getMetadata(request: Request): SessionMetadata {
    return {
      ipAddress: request.ip,
      userAgent: request.header('user-agent'),
    };
  }

  private withoutRefreshToken(session: IssuedAuthSession): AuthResponse {
    return {
      accessToken: session.accessToken,
      accessTokenExpiresIn: session.accessTokenExpiresIn,
      user: session.user,
    };
  }
}
