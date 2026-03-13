import { MealSuggestDishesResponse } from '@nutrition/shared';
import { apiClient } from './api-client';

/** Send a captured photo to the suggest-dishes endpoint and return 5 dish suggestions */
export async function suggestDishes(
  imageUri: string,
  signal?: AbortSignal,
): Promise<MealSuggestDishesResponse> {
  const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';

  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: mimeType,
    name: `photo.${ext}`,
  } as unknown as Blob);

  const { data } = await apiClient.post<MealSuggestDishesResponse>(
    '/meal-assistant/suggest-dishes',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' }, signal },
  );
  return data;
}
