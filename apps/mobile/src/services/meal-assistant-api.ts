import { MealAnalyzeImageResponse } from '@nutrition/shared';
import { apiClient } from './api-client';

/** Send a captured photo to the suggest-dishes endpoint and return food analysis */
export async function analyzeFood(
  imageUri: string,
  signal?: AbortSignal,
): Promise<MealAnalyzeImageResponse> {
  const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';

  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: mimeType,
    name: `photo.${ext}`,
  } as unknown as Blob);

  const { data } = await apiClient.post<MealAnalyzeImageResponse>(
    '/api/v1/meal-assistant/suggest-dishes',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' }, signal },
  );
  return data;
}
