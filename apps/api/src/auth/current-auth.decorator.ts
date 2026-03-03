import { ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest } from '../common/auth/authenticated-request.type';
import { JwtPayload } from '../common/security/auth-token.service';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) {
      throw new UnauthorizedException('Authentication payload missing');
    }

    return request.auth;
  },
);
