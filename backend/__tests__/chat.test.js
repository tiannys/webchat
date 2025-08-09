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

describe('Chat session API', () => {
  test('denies access without authentication', async () => {
    const res = await request(app).get('/api/chat/sessions');
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error', 'Access token required');
  });
});
