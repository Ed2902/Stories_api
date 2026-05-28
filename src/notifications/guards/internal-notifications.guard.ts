import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class InternalNotificationsGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedToken = this.configService.get<string>(
      'notifications.internalToken',
    );
    const providedToken =
      request.headers['x-internal-token'] ||
      request.headers['x-notifications-token'];

    if (!expectedToken || providedToken !== expectedToken) {
      throw new UnauthorizedException('Invalid internal notifications token');
    }

    return true;
  }
}
