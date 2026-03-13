/** Extract a user-friendly error message from an axios error */
export function extractApiErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Something went wrong. Please try again.';

  const axiosError = error as {
    response?: { status?: number; data?: { message?: string } };
    message?: string;
  };

  if (axiosError.response?.data?.message) return axiosError.response.data.message;
  if (axiosError.response?.status === 401) return 'Please log in again.';
  if (axiosError.response?.status) return 'Something went wrong. Please try again.';
  if (axiosError.message?.includes('Network Error'))
    return 'Unable to connect. Check your internet and try again.';

  return 'Something went wrong. Please try again.';
}
