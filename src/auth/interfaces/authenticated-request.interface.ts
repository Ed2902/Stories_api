import { Request } from 'express';

export interface AuthenticatedRequestUser {
  userId: string;
  sessionId: string;
  email?: string;
  tokenType: 'access';
}

export interface RequestWithAuthenticatedUser extends Request {
  user?: AuthenticatedRequestUser;
}
