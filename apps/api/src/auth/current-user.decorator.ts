import { ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest } from '../common/auth/authenticated-request.type';
import { AuthenticatedUser } from '../common/auth/authenticated-user.type';

// TODO: remove dev fallback when auth is fully wired in mobile app
const DEV_USER: AuthenticatedUser = Object.freeze({
  id: '00000000-0000-0000-0000-000000000000',
  email: 'dev@dev.local',
  name: 'Dev User',
});

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      // Dev fallback — remove when auth guard is re-enabled
      return DEV_USER;
    }

    return request.user;
  },
);
