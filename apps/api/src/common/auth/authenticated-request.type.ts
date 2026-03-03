import { FastifyRequest } from 'fastify';
import { JwtPayload } from '../security/auth-token.service';
import { AuthenticatedUser } from './authenticated-user.type';

export type AuthenticatedRequest = FastifyRequest & {
  user?: AuthenticatedUser;
  auth?: JwtPayload;
  authToken?: string;
};
