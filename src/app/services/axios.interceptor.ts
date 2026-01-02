import axios from 'axios';
import { AuthService } from './auth.service';

/**
 * Setup Axios interceptor to automatically add JWT token to all requests
 * This should be called once during app initialization
 */
export function setupAxiosInterceptor(authService: AuthService): void {
  // Request interceptor - add JWT token to headers
  axios.interceptors.request.use(
    (config) => {
      const token = authService.getIdToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor - handle 401 errors
  axios.interceptors.response.use(
    (response) => {
      return response;
    },
    (error) => {
      if (error.response && error.response.status === 401) {
        // Token expired or invalid - sign out user
        authService.signOut();
        // Redirect to login
        window.location.href = '/auth/login';
      }
      return Promise.reject(error);
    }
  );
}
