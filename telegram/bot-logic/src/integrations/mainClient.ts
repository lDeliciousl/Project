import axios, { AxiosInstance } from 'axios';
import { NotificationResponse } from '../domain/types';
import { config } from '../config';
import { logger } from '../logger';

export interface MainClient {
  getNotifications(accessToken: string): Promise<NotificationResponse>;
  clearNotifications(accessToken: string): Promise<void>;
  getTests(accessToken: string): Promise<unknown>;
}

class HttpMainClient implements MainClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.mainModuleUrl,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getNotifications(accessToken: string): Promise<NotificationResponse> {
    const response = await this.client.get('/api/notification', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  }

  async clearNotifications(accessToken: string): Promise<void> {
    await this.client.delete('/api/notification', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }

  async getTests(accessToken: string): Promise<unknown> {
    const response = await this.client.get('/api/tests', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  }
}

class MockMainClient implements MainClient {
  async getNotifications(): Promise<NotificationResponse> {
    return { notifications: ['Mock notification: new test available'] };
  }

  async clearNotifications(): Promise<void> {
    return;
  }

  async getTests(): Promise<unknown> {
    return [
      { id: 1, name: 'Mock test A' },
      { id: 2, name: 'Mock test B' }
    ];
  }
}

export const createMainClient = (): MainClient => {
  if (config.useMocks) {
    logger.warn('MainClient: using mock implementation');
    return new MockMainClient();
  }
  return new HttpMainClient();
};
