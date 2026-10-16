export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  useMock: import.meta.env.VITE_USE_MOCK === 'true',
};
