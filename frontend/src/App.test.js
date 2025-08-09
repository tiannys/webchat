import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import App from './App';

test('renders sign in form by default', async () => {
  const container = document.createElement('div');
  await act(async () => {
    createRoot(container).render(<App />);
  });
  expect(container.innerHTML).toMatch(/Sign In/);
});
