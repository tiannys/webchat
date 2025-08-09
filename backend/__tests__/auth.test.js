const request = require('supertest');

// Mock pg to avoid real database connections
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn((text, params, cb) => {
      if (typeof params === 'function') cb = params;
      if (cb) cb(null, { rows: [] });
      return Promise.resolve({ rows: [] });
    })
  };
  return { Pool: jest.fn(() => mPool) };
});

const app = require('../server');

describe('Authentication API', () => {
  test('requires email and password on login', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Email and password are required');
  });
});
