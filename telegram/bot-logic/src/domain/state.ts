import { UserStatus } from './types';

export type UserState = {
  status: UserStatus;
  login_token?: string;
  access_token?: string;
  refresh_token?: string;
  updated_at: string;
};

export const createAnonymousState = (loginToken: string): UserState => ({
  status: 'anonymous',
  login_token: loginToken,
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
