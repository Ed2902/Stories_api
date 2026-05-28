import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SecurityLoggerService } from '../../logger/security-logger.service';
import { RequestWithAuthenticatedUser } from '../interfaces/authenticated-request.interface';
import { JwtAccessTokenPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<RequestWithAuthenticatedUser>();
    const token = this.extractBearerToken(request);

    if (!token) {
      this.securityLogger.log('auth.catalog_request', 'failure', {
        ipAddress: request.ip,
        userAgent: request.header('user-agent'),
        reason: 'missing_bearer_token',
      });
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: JwtAccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtAccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('auth.accessTokenSecret'),
      });
    } catch (error) {
      this.securityLogger.log('auth.catalog_request', 'failure', {
        ipAddress: request.ip,
        userAgent: request.header('user-agent'),
        reason: 'invalid_bearer_token',
        metadata: {
          error: error instanceof Error ? error.message : 'unknown_error',
        },
      });
      throw new UnauthorizedException('Invalid access token');
    }

    if (
      payload.typ !== 'access' ||
      !payload.sub?.trim() ||
      !payload.sid?.trim()
    ) {
      this.securityLogger.log('auth.catalog_request', 'failure', {
        ipAddress: request.ip,
        userAgent: request.header('user-agent'),
        reason: 'invalid_access_token_payload',
      });
      throw new UnauthorizedException('Invalid access token');
    }

    request.user = {
      userId: payload.sub,
      sessionId: payload.sid,
      email: payload.email,
      tokenType: 'access',
    };

    this.securityLogger.log('auth.notifications_request', 'success', {
      actorUserId: request.user.userId,
      actorSessionId: request.user.sessionId,
      ipAddress: request.ip,
      userAgent: request.header('user-agent'),
    });

    return true;
  }

  private extractBearerToken(
    request: RequestWithAuthenticatedUser,
  ): string | null {
    const authorizationHeader = request.header('authorization');

    if (!authorizationHeader) {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme !== 'Bearer' || !token?.trim()) {
      return null;
    }

    return token.trim();
  }
}
