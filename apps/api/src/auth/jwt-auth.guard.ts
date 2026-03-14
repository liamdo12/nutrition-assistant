import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedRequest } from '../common/auth/authenticated-request.type';
import { AuthTokenService } from '../common/security/auth-token.service';
import { AuthRepository } from './auth.repository';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: AuthTokenService,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.tokenService.extractBearerToken(request.headers.authorization);
    const payload = this.tokenService.verify(token);

    const user = await this.authRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    // Admin tokens are permanent — skip version and revocation checks
    const isAdmin = user.role === 'ADMIN';
    if (!isAdmin) {
      if (user.tokenVersion !== payload.tv) {
        throw new UnauthorizedException('Authentication token is no longer valid');
      }

      const revoked = await this.authRepository.isTokenRevoked(payload.jti, new Date());
      if (revoked) {
        throw new UnauthorizedException('Authentication token is no longer valid');
      }
    }

    request.user = Object.freeze({
      id: user.id,
      email: user.email,
      name: user.name,
    });
    request.auth = payload;
    request.authToken = token;

    return true;
  }
}
