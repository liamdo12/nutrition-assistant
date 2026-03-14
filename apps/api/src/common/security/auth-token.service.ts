import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { AppConfig } from '../../config/app.config';
import { parseDurationToSeconds } from './duration.util';

const jwtPayloadSchema = z.object({
  jti: z.string().uuid(),
  sub: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  tv: z.number().int().nonnegative(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

export type JwtPayload = Readonly<z.infer<typeof jwtPayloadSchema>>;

export interface SignTokenInput {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly tokenVersion: number;
  /** Override default JWT_EXPIRES_IN duration (e.g. '36500d' for ~100 years) */
  readonly expiresInOverride?: string;
}

@Injectable()
export class AuthTokenService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  sign(input: SignTokenInput): string {
    const secret = this.configService.get('JWT_SECRET', { infer: true });
    const expiresIn: string = input.expiresInOverride ?? this.configService.get('JWT_EXPIRES_IN', { infer: true });

    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
      jti: randomUUID(),
      sub: input.userId,
      email: input.email,
      name: input.name,
      tv: input.tokenVersion,
      iat: issuedAt,
      exp: issuedAt + parseDurationToSeconds(expiresIn, 'JWT_EXPIRES_IN'),
    };

    const encodedHeader = this.encodeSegment({ alg: 'HS256', typ: 'JWT' });
    const encodedPayload = this.encodeSegment(payload);
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', secret).update(unsignedToken).digest('base64url');

    return `${unsignedToken}.${signature}`;
  }

  verify(token: string): JwtPayload {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    const secret = this.configService.get('JWT_SECRET', { infer: true });
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    let providedSignature: Buffer;
    try {
      providedSignature = Buffer.from(encodedSignature, 'base64url');
    } catch {
      throw new UnauthorizedException('Invalid authentication token');
    }

    const expectedSignature = createHmac('sha256', secret).update(unsignedToken).digest();
    if (
      providedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(providedSignature, expectedSignature)
    ) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    const payload = this.decodePayload(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      throw new UnauthorizedException('Authentication token expired');
    }

    return payload;
  }

  extractBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    return token;
  }

  private decodePayload(encodedPayload: string): JwtPayload {
    try {
      const rawPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
      return jwtPayloadSchema.parse(rawPayload);
    } catch {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  private encodeSegment(value: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }
}
