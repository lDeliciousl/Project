import axios, { AxiosInstance } from 'axios';
import { NotificationResponse } from '../domain/types';
import { config } from '../config';
import { logger } from '../logger';

export interface MainClient {
  getUsers(accessToken: string): Promise<unknown>;
  getUserName(accessToken: string, userId: string): Promise<unknown>;
  setUserName(accessToken: string, userId: string, name: string): Promise<unknown>;
  getUserCourses(accessToken: string, userId: string): Promise<unknown>;
  getUserGrades(accessToken: string, userId: string): Promise<unknown>;
  getUserTests(accessToken: string, userId: string): Promise<unknown>;
  getUserRoles(accessToken: string, userId: string): Promise<unknown>;
  setUserRoles(accessToken: string, userId: string, roles: unknown): Promise<unknown>;
  getUserBlocked(accessToken: string, userId: string): Promise<unknown>;
  setUserBlocked(accessToken: string, userId: string, blocked: boolean): Promise<unknown>;
  addUser(accessToken: string, payload: unknown): Promise<unknown>;
  getCourses(accessToken: string): Promise<unknown>;
  getCourseInfo(accessToken: string, courseId: string): Promise<unknown>;
  createCourse(accessToken: string, payload: unknown): Promise<unknown>;
  updateCourse(accessToken: string, courseId: string, payload: unknown): Promise<unknown>;
  deleteCourse(accessToken: string, courseId: string): Promise<unknown>;
  getCourseStudents(accessToken: string, courseId: string): Promise<unknown>;
  getCourseTests(accessToken: string, courseId: string): Promise<unknown>;
  enrollCourse(accessToken: string, courseId: string, userId?: string): Promise<unknown>;
  unenrollCourse(accessToken: string, courseId: string, userId: string): Promise<unknown>;
  getTestDetails(accessToken: string, testId: string): Promise<unknown>;
  createTest(accessToken: string, payload: unknown): Promise<unknown>;
  activateTest(accessToken: string, testId: string, isActive: boolean): Promise<unknown>;
  addQuestionToTest(accessToken: string, testId: string, questionId: string): Promise<unknown>;
  removeQuestionFromTest(accessToken: string, testId: string, questionId: string): Promise<unknown>;
  createTestAttempt(accessToken: string, payload: unknown): Promise<unknown>;
  getQuestions(accessToken: string): Promise<unknown>;
  getQuestion(accessToken: string, questionId: string): Promise<unknown>;
  createQuestion(accessToken: string, payload: unknown): Promise<unknown>;
  updateQuestion(accessToken: string, questionId: string, payload: unknown): Promise<unknown>;
  deleteQuestion(accessToken: string, questionId: string): Promise<unknown>;
  getAttempt(accessToken: string, attemptId: string): Promise<unknown>;
  finishAttempt(accessToken: string, attemptId: string): Promise<unknown>;
  updateAnswer(accessToken: string, attemptId: string, answerId: string, optionId: string): Promise<unknown>;
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

  private authHeaders(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  private isNotFound(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 404;
  }

  private isUnauthorized(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 401;
  }

  async getNotifications(accessToken: string): Promise<NotificationResponse> {
    try {
      const response = await this.client.get('/notification', {
        headers: this.authHeaders(accessToken)
      });
      return response.data;
    } catch (error) {
      if (this.isUnauthorized(error)) {
        throw error;
      }
      if (!this.isNotFound(error)) {
        throw error;
      }
      try {
        const response = await this.client.get('/api/notification', {
          headers: this.authHeaders(accessToken)
        });
        return response.data;
      } catch (fallbackError) {
        if (this.isUnauthorized(fallbackError)) {
          throw fallbackError;
        }
        if (!this.isNotFound(fallbackError)) {
          throw fallbackError;
        }
        try {
          const response = await this.client.get('/api/notifications', {
            headers: this.authHeaders(accessToken)
          });
          return response.data;
        } catch (finalError) {
          if (this.isUnauthorized(finalError)) {
            throw finalError;
          }
          if (!this.isNotFound(finalError)) {
            throw finalError;
          }
          logger.warn('MainClient: notifications endpoint not found');
          return { notifications: [] };
        }
      }
    }
  }

  async clearNotifications(accessToken: string): Promise<void> {
    try {
      await this.client.delete('/notification', {
        headers: this.authHeaders(accessToken)
      });
    } catch (error) {
      if (this.isUnauthorized(error)) {
        throw error;
      }
      if (!this.isNotFound(error)) {
        throw error;
      }
      try {
        await this.client.delete('/api/notification', {
          headers: this.authHeaders(accessToken)
        });
      } catch (fallbackError) {
        if (this.isUnauthorized(fallbackError)) {
          throw fallbackError;
        }
        if (!this.isNotFound(fallbackError)) {
          throw fallbackError;
        }
        try {
          await this.client.delete('/api/notifications', {
            headers: this.authHeaders(accessToken)
          });
        } catch (finalError) {
          if (this.isUnauthorized(finalError)) {
            throw finalError;
          }
          if (!this.isNotFound(finalError)) {
            throw finalError;
          }
          logger.warn('MainClient: notifications clear endpoint not found');
        }
      }
    }
  }

  async getTests(accessToken: string): Promise<unknown> {
    const response = await this.client.get('/api/tests', {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getUsers(accessToken: string): Promise<unknown> {
    const response = await this.client.get('/api/db/users', {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getUserName(accessToken: string, userId: string): Promise<unknown> {
    const response = await this.client.get(`/api/db/users/${userId}/name`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async setUserName(accessToken: string, userId: string, name: string): Promise<unknown> {
    const response = await this.client.put(
      `/api/db/users/${userId}/name`,
      { name },
      { headers: this.authHeaders(accessToken) }
    );
    return response.data;
  }

  async getUserCourses(accessToken: string, userId: string): Promise<unknown> {
    const response = await this.client.get(`/api/db/users/${userId}/courses`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getUserGrades(accessToken: string, userId: string): Promise<unknown> {
    const response = await this.client.get(`/api/db/users/${userId}/grades`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getUserTests(accessToken: string, userId: string): Promise<unknown> {
    const response = await this.client.get(`/api/db/users/${userId}/tests`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getUserRoles(accessToken: string, userId: string): Promise<unknown> {
    const response = await this.client.get(`/api/db/users/${userId}/roles`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async setUserRoles(accessToken: string, userId: string, roles: unknown): Promise<unknown> {
    const response = await this.client.put(
      `/api/db/users/${userId}/roles`,
      { roles },
      { headers: this.authHeaders(accessToken) }
    );
    return response.data;
  }

  async getUserBlocked(accessToken: string, userId: string): Promise<unknown> {
    const response = await this.client.get(`/api/db/users/${userId}/block`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async setUserBlocked(accessToken: string, userId: string, blocked: boolean): Promise<unknown> {
    const response = await this.client.put(
      `/api/db/users/${userId}/block`,
      { is_blocked: blocked },
      { headers: this.authHeaders(accessToken) }
    );
    return response.data;
  }

  async addUser(accessToken: string, payload: unknown): Promise<unknown> {
    const response = await this.client.post('/api/db/addUser', payload, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getCourses(accessToken: string): Promise<unknown> {
    const response = await this.client.get('/api/courses', {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getCourseInfo(accessToken: string, courseId: string): Promise<unknown> {
    const response = await this.client.get(`/api/courses/${courseId}`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async createCourse(accessToken: string, payload: unknown): Promise<unknown> {
    const response = await this.client.post('/api/courses', payload, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async updateCourse(accessToken: string, courseId: string, payload: unknown): Promise<unknown> {
    const response = await this.client.put(`/api/courses/${courseId}`, payload, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async deleteCourse(accessToken: string, courseId: string): Promise<unknown> {
    const response = await this.client.delete(`/api/courses/${courseId}`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getCourseStudents(accessToken: string, courseId: string): Promise<unknown> {
    const response = await this.client.get(`/api/courses/${courseId}/students`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getCourseTests(accessToken: string, courseId: string): Promise<unknown> {
    const response = await this.client.get(`/api/courses/${courseId}/tests`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async enrollCourse(accessToken: string, courseId: string, userId?: string): Promise<unknown> {
    const payload = userId ? { user_id: userId } : {};
    const response = await this.client.post(`/api/courses/${courseId}/enroll`, payload, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async unenrollCourse(accessToken: string, courseId: string, userId: string): Promise<unknown> {
    const response = await this.client.delete(`/api/courses/${courseId}/enroll/${userId}`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getTestDetails(accessToken: string, testId: string): Promise<unknown> {
    const response = await this.client.get(`/api/tests/${testId}`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async createTest(accessToken: string, payload: unknown): Promise<unknown> {
    const response = await this.client.post('/api/tests', payload, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async activateTest(accessToken: string, testId: string, isActive: boolean): Promise<unknown> {
    const response = await this.client.put(
      `/api/tests/${testId}/activate`,
      { is_active: isActive },
      { headers: this.authHeaders(accessToken) }
    );
    return response.data;
  }

  async addQuestionToTest(accessToken: string, testId: string, questionId: string): Promise<unknown> {
    const response = await this.client.post(
      `/api/tests/${testId}/questions`,
      { question_id: questionId },
      { headers: this.authHeaders(accessToken) }
    );
    return response.data;
  }

  async removeQuestionFromTest(
    accessToken: string,
    testId: string,
    questionId: string
  ): Promise<unknown> {
    const response = await this.client.delete(`/api/tests/${testId}/questions/${questionId}`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async createTestAttempt(accessToken: string, payload: unknown): Promise<unknown> {
    const response = await this.client.post('/api/tests/attempts', payload, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getQuestions(accessToken: string): Promise<unknown> {
    const response = await this.client.get('/api/questions', {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getQuestion(accessToken: string, questionId: string): Promise<unknown> {
    const response = await this.client.get(`/api/questions/${questionId}`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async createQuestion(accessToken: string, payload: unknown): Promise<unknown> {
    const response = await this.client.post('/api/questions', payload, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async updateQuestion(accessToken: string, questionId: string, payload: unknown): Promise<unknown> {
    const response = await this.client.put(`/api/questions/${questionId}`, payload, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async deleteQuestion(accessToken: string, questionId: string): Promise<unknown> {
    const response = await this.client.delete(`/api/questions/${questionId}`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async getAttempt(accessToken: string, attemptId: string): Promise<unknown> {
    const response = await this.client.get(`/api/attempts/${attemptId}`, {
      headers: this.authHeaders(accessToken)
    });
    return response.data;
  }

  async finishAttempt(accessToken: string, attemptId: string): Promise<unknown> {
    const response = await this.client.post(
      `/api/attempts/${attemptId}/finish`,
      {},
      { headers: this.authHeaders(accessToken) }
    );
    return response.data;
  }

  async updateAnswer(
    accessToken: string,
    attemptId: string,
    answerId: string,
    optionId: string
  ): Promise<unknown> {
    const response = await this.client.put(
      `/api/attempts/${attemptId}/answers/${answerId}`,
      { option_id: optionId },
      { headers: this.authHeaders(accessToken) }
    );
    return response.data;
  }
}

class MockMainClient implements MainClient {
  async getUsers(): Promise<unknown> {
    return { users: [] };
  }

  async getUserName(): Promise<unknown> {
    return { id: 'mock', name: 'Mock User' };
  }

  async setUserName(): Promise<unknown> {
    return { status: 'success' };
  }

  async getUserCourses(): Promise<unknown> {
    return { courses: [] };
  }

  async getUserGrades(): Promise<unknown> {
    return { grades: {} };
  }

  async getUserTests(): Promise<unknown> {
    return { tests: [] };
  }

  async getUserRoles(): Promise<unknown> {
    return { roles: ['student'] };
  }

  async setUserRoles(): Promise<unknown> {
    return { status: 'success' };
  }

  async getUserBlocked(): Promise<unknown> {
    return { is_blocked: false };
  }

  async setUserBlocked(): Promise<unknown> {
    return { status: 'success' };
  }

  async addUser(): Promise<unknown> {
    return { status: 'success' };
  }

  async getCourses(): Promise<unknown> {
    return { courses: [] };
  }

  async getCourseInfo(): Promise<unknown> {
    return { id: 'course', name: 'Mock course' };
  }

  async createCourse(): Promise<unknown> {
    return { status: 'success', id: 'course' };
  }

  async updateCourse(): Promise<unknown> {
    return { status: 'success' };
  }

  async deleteCourse(): Promise<unknown> {
    return { status: 'success' };
  }

  async getCourseStudents(): Promise<unknown> {
    return { students: [] };
  }

  async getCourseTests(): Promise<unknown> {
    return { tests: [] };
  }

  async enrollCourse(): Promise<unknown> {
    return { status: 'success' };
  }

  async unenrollCourse(): Promise<unknown> {
    return { status: 'success' };
  }

  async getTestDetails(): Promise<unknown> {
    return { id: 'test', name: 'Mock test' };
  }

  async createTest(): Promise<unknown> {
    return { status: 'success', id: 'test' };
  }

  async activateTest(): Promise<unknown> {
    return { status: 'success' };
  }

  async addQuestionToTest(): Promise<unknown> {
    return { status: 'success' };
  }

  async removeQuestionFromTest(): Promise<unknown> {
    return { status: 'success' };
  }

  async createTestAttempt(): Promise<unknown> {
    return { status: 'success', attempt_id: 'attempt' };
  }

  async getQuestions(): Promise<unknown> {
    return { questions: [] };
  }

  async getQuestion(): Promise<unknown> {
    return { id: 'question', text: 'Mock question' };
  }

  async createQuestion(): Promise<unknown> {
    return { status: 'success', id: 'question' };
  }

  async updateQuestion(): Promise<unknown> {
    return { status: 'success' };
  }

  async deleteQuestion(): Promise<unknown> {
    return { status: 'success' };
  }

  async getAttempt(): Promise<unknown> {
    return { id: 'attempt', status: 'in_progress', answers: [] };
  }

  async finishAttempt(): Promise<unknown> {
    return { status: 'success' };
  }

  async updateAnswer(): Promise<unknown> {
    return { status: 'success' };
  }

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
