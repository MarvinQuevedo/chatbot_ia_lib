import axios from 'axios';

/**
 * Creates a pre-configured Axios instance for making HTTP calls to business APIs.
 *
 * Features:
 * - Default timeout
 * - Request/response logging (when debug enabled)
 * - Proper error serialization
 *
 * @param {object} [options={}]
 * @param {number} [options.timeout=10000] - Default timeout in ms
 * @param {boolean} [options.debug=false] - Log all requests and responses
 * @returns {import('axios').AxiosInstance}
 */
export function createHttpClient(options = {}) {
  const client = axios.create({
    timeout: options.timeout || 10000,
    headers: {
      'User-Agent': 'chatbot-ia-lib/0.1.0',
    },
  });

  if (options.debug) {
    client.interceptors.request.use((config) => {
      console.debug(`[HTTP] ${config.method?.toUpperCase()} ${config.url}`, {
        params: config.params,
        data: config.data,
      });
      return config;
    });

    client.interceptors.response.use(
      (response) => {
        console.debug(`[HTTP] ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.debug(`[HTTP] ERROR ${error.response?.status || error.code} ${error.config?.url}`);
        return Promise.reject(error);
      },
    );
  }

  return client;
}
