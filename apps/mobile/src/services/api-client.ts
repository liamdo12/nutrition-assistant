import axios from 'axios';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/auth.store';

const API_URL = Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});

apiClient.interceptors.request.use(config => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
