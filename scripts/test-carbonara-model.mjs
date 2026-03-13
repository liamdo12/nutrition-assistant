import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000/api/v1';
const TARGET_DISH = process.env.TARGET_DISH ?? 'Carbonara';
const LOCALE = process.env.LOCALE ?? 'en';
const IMAGE_PATH = resolve(process.env.IMAGE_PATH ?? 'docs/image-to-test.jpg');
const TEST_EMAIL =
  process.env.TEST_EMAIL ?? `carbonara-test+${Date.now()}@example.com`;
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'Passw0rd!234';
const TEST_NAME = process.env.TEST_NAME ?? 'Carbonara Test Bot';
const SERVINGS = Number(process.env.SERVINGS ?? 2);

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Carbonara model test script

Usage:
  node scripts/test-carbonara-model.mjs
  yarn test:model:carbonara

Optional env vars:
  API_BASE=http://127.0.0.1:3000/api/v1
  IMAGE_PATH=docs/image-to-test.jpg
  TARGET_DISH=Carbonara
  LOCALE=en
  SERVINGS=2
  TEST_EMAIL=carbonara-test@example.com
  TEST_PASSWORD=Passw0rd!234
  TEST_NAME="Carbonara Test Bot"
`);
  process.exit(0);
}

async function main() {
  console.log(`[info] API_BASE=${API_BASE}`);
  console.log(`[info] IMAGE_PATH=${IMAGE_PATH}`);

  const token = await getToken();
  console.log('[ok] Authenticated');

  const imageBuffer = await readFile(IMAGE_PATH);
  const imageMimeType = inferImageMimeType(IMAGE_PATH);

  const suggestForm = new FormData();
  suggestForm.append('image', new Blob([imageBuffer], { type: imageMimeType }), 'ingredients.jpg');
  suggestForm.append('locale', LOCALE);
  suggestForm.append(
    'constraints',
    `Prioritize ${TARGET_DISH} if ingredients match. Keep recipe practical.`,
  );

  const suggestRes = await fetch(`${API_BASE}/meal-assistant/suggest-dishes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: suggestForm,
  });

  const suggestJson = await parseJsonOrThrow(suggestRes, 'suggest-dishes');
  const suggestions = Array.isArray(suggestJson?.suggestions) ? suggestJson.suggestions : [];
  const analysisToken = String(suggestJson?.analysisToken ?? '');

  console.log('\n=== Suggest Dishes ===');
  for (const item of suggestions) {
    console.log(`- ${item.name} (${item.id})`);
  }

  if (!analysisToken || suggestions.length === 0) {
    throw new Error('No analysisToken or empty suggestions returned');
  }

  const selectedDish =
    suggestions.find(item => String(item?.name ?? '').toLowerCase().includes(TARGET_DISH.toLowerCase())) ??
    suggestions[0];
  const matchedTarget = String(selectedDish?.name ?? '')
    .toLowerCase()
    .includes(TARGET_DISH.toLowerCase());

  console.log(`\n[info] Selected dish: ${selectedDish.name}`);
  console.log(`[info] Target matched (${TARGET_DISH}): ${matchedTarget ? 'YES' : 'NO'}`);

  const generateRes = await fetch(`${API_BASE}/meal-assistant/generate-recipe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      analysisToken,
      selectedDishId: selectedDish.id,
      servings: Number.isFinite(SERVINGS) ? SERVINGS : 2,
      preferences: 'Classic Italian style, no cream, use egg and parmesan if possible',
    }),
  });

  const generateJson = await parseJsonOrThrow(generateRes, 'generate-recipe');
  const recipe = generateJson?.recipe;

  console.log('\n=== Generated Recipe ===');
  console.log(`Title: ${recipe?.title ?? 'N/A'}`);
  console.log(`Ingredients: ${Array.isArray(recipe?.ingredients) ? recipe.ingredients.length : 0}`);
  console.log(`Steps: ${Array.isArray(recipe?.steps) ? recipe.steps.length : 0}`);
  if (recipe?.nutritionEstimate) {
    console.log('Nutrition estimate:', recipe.nutritionEstimate);
  }

  console.log('\n[done] Carbonara model test completed');
}

async function getToken() {
  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: TEST_NAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  if (registerRes.ok) {
    const registerJson = await parseJsonOrThrow(registerRes, 'auth/register');
    if (registerJson?.token) {
      return String(registerJson.token);
    }
  }

  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  const loginJson = await parseJsonOrThrow(loginRes, 'auth/login');
  if (!loginJson?.token) {
    throw new Error('Missing token in login response');
  }

  return String(loginJson.token);
}

function inferImageMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function parseJsonOrThrow(response, label) {
  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${raw}`);
  }

  return parsed;
}

main().catch(error => {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
