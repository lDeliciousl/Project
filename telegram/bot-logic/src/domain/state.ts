import { UserStatus } from './types';

export type PendingAction = 'awaiting_email' | 'awaiting_code';

export type UserState = {
  status: UserStatus;
  login_token?: string;
  access_token?: string;
  refresh_token?: string;
  pending_action?: PendingAction;
  updated_at: string;
};

export const createAnonymousState = (
  loginToken: string,
  pendingAction?: PendingAction
): UserState => ({
  status: 'anonymous',
  login_token: loginToken,
  pending_action: pendingAction,
  updated_at: new Date().toISOString()
});

export const createAuthorizedState = (
  accessToken: string,
  refreshToken: string
): UserState => ({
  status: 'authorized',
  access_token: accessToken,
  refresh_token: refreshToken,
  updated_at: new Date().toISOString()
});
