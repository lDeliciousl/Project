import axios, { AxiosInstance } from 'axios';
import { AuthInitResponse, AuthVerifyResponse, RefreshResponse } from '../domain/types';
import { config } from '../config';
import { logger } from '../logger';

export interface AuthClient {
  initOAuth(type: string, loginToken: string): Promise<AuthInitResponse>;
  verifyLoginToken(loginToken: string): Promise<AuthVerifyResponse>;
  generateAuthCode(loginToken: string, email: string): Promise<{ code: string }>;
  verifyAuthCode(loginToken: string, code: string, refreshToken?: string): Promise<void>;
  verifyConfirmCode(code: string, refreshToken: string): Promise<void>;
  refreshTokens(refreshToken: string): Promise<RefreshResponse>;
  logout(refreshToken: string): Promise<void>;
}

class HttpAuthClient implements AuthClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.authModuleUrl,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async initOAuth(type: string, loginToken: string): Promise<AuthInitResponse> {
    const response = await this.client.post('/api/auth/init', {
      type,
      login_token: loginToken
    });
    return response.data;
  }

  async verifyLoginToken(loginToken: string): Promise<AuthVerifyResponse> {
    const response = await this.client.get(`/api/auth/verify/${loginToken}`);
    return response.data;
  }

  async generateAuthCode(loginToken: string, email: string): Promise<{ code: string }> {
    const response = await this.client.post('/api/auth/code/generate', {
      login_token: loginToken,
      email
    });
    return response.data;
  }

  async verifyAuthCode(loginToken: string, code: string, refreshToken?: string): Promise<void> {
    const payload: Record<string, string> = {
      login_token: loginToken,
      code
    };
    if (refreshToken) {
      payload.refresh_token = refreshToken;
    }
    await this.client.post('/api/auth/code/verify', payload);
  }

  async verifyConfirmCode(code: string, refreshToken: string): Promise<void> {
    await this.client.post('/api/auth/confirm/verify', {
      code,
      refresh_token: refreshToken
    });
  }

  async refreshTokens(refreshToken: string): Promise<RefreshResponse> {
    const response = await this.client.post('/api/auth/refresh', {
      refresh_token: refreshToken
    });
    return response.data;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.client.post('/api/auth/logout', {
      refresh_token: refreshToken
    });
  }
}

type MockState = {
  status: 'pending' | 'approved' | 'denied';
};

class MockAuthClient implements AuthClient {
  private readonly store = new Map<string, MockState>();

  async initOAuth(type: string, loginToken: string): Promise<AuthInitResponse> {
    this.store.set(loginToken, { status: 'pending' });
    if (type === 'code') {
      return { code: String(Math.floor(Math.random() * 900000 + 100000)) };
    }
    return { auth_url: `https://auth.example.com/${type}?state=${loginToken}` };
  }

  async verifyLoginToken(loginToken: string): Promise<AuthVerifyResponse> {
    const state = this.store.get(loginToken);
    if (!state) {
      return { status: 'expired' };
    }

    if (config.mockAutoApprove && state.status === 'pending') {
      state.status = 'approved';
    }

    if (state.status === 'approved') {
      return {
        status: 'approved',
        access_token: `mock-access-${loginToken}`,
        refresh_token: `mock-refresh-${loginToken}`
      };
    }

    return { status: 'pending' };
  }

  async generateAuthCode(loginToken: string, email: string): Promise<{ code: string }> {
    return {
      code: String(Math.floor(Math.random() * 900000 + 100000))
    };
  }

  async verifyAuthCode(): Promise<void> {
    return;
  }

  async verifyConfirmCode(): Promise<void> {
    return;
  }

  async refreshTokens(refreshToken: string): Promise<RefreshResponse> {
    return {
      access_token: `mock-access-${refreshToken}`,
      refresh_token: `mock-refresh-${refreshToken}`
    };
  }

  async logout(): Promise<void> {
    return;
  }
}

export const createAuthClient = (): AuthClient => {
  if (config.useMocks) {
    logger.warn('AuthClient: using mock implementation');
    return new MockAuthClient();
  }
  return new HttpAuthClient();
};
