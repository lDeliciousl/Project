import { UserStatus } from './types';

export type PendingAction = 'awaiting_confirm';

export type TestFlowOption = {
  id: string;
  text: string;
};

export type TestFlowQuestion = {
  id: string;
  text: string;
  options: TestFlowOption[];
};

export type TestFlowState = {
  test_id: string;
  attempt_id: string;
  current_index: number;
  questions: TestFlowQuestion[];
  updated_at: string;
};

export type UserState = {
  status: UserStatus;
  login_token?: string;
  access_token?: string;
  refresh_token?: string;
  pending_action?: PendingAction;
  test_flow?: TestFlowState;
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
