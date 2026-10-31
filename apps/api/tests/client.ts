import { expect } from 'vitest';
import app from '../src/index';

export const testSecret = 'multi-user-test-secret-at-least-thirty-two-characters';
export const ownerCredentials = {
  name: 'Original Owner',
  email: 'owner@example.test',
  password: 'a private owner password',
};
export const memberCredentials = {
  name: 'New Member',
  email: 'member@example.test',
  password: 'a private member password',
};

export function client(db: D1Database, initialCookie = '') {
  let cookie = initialCookie;
  return {
    get cookie() {
      return cookie;
    },
    async request(path: string, method = 'GET', body?: unknown) {
      const response = await app.request(
        `http://localhost/api/v1${path}`,
        {
          method,
          headers: {
            Cookie: cookie,
            Origin: 'http://localhost:5173',
            'Content-Type': 'application/json',
            'X-Finance-Client': 'web',
          },
          ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
        },
        {
          DB: db,
          SESSION_SECRET: testSecret,
          APP_ORIGIN: 'http://localhost:5173',
          ENVIRONMENT: 'development',
        },
      );
      const set = response.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return response;
    },
    async data<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
      const response = await this.request(path, method, body);
      expect(response.status, await response.clone().text()).toBeLessThan(300);
      return response.json() as Promise<T>;
    },
  };
}
