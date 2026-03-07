# Meal Assistant Raw API Test

- Time (UTC): 2026-03-07T06:06:08Z
- API base: http://127.0.0.1:3000/api/v1
- Test image: docs/image-to-test.jpg
- Test account email: mealtest+20260307010608@example.com

## Auth bootstrap (for JWT only)

### POST /auth/register
- Status: 201

```json
{"user":{"id":"68a86dfd-e003-483e-987a-8f7bbdeaaed6","email":"mealtest+20260307010608@example.com","name":"Meal API Test Bot","createdAt":"2026-03-07T06:06:08.832Z"},"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiMjExN2U1OS00ZjZlLTQ1YWMtYWYyYy05YTIxNWI2OWRkNzkiLCJzdWIiOiI2OGE4NmRmZC1lMDAzLTQ4M2UtOTg3YS04ZjdiYmRlYWFlZDYiLCJlbWFpbCI6Im1lYWx0ZXN0KzIwMjYwMzA3MDEwNjA4QGV4YW1wbGUuY29tIiwibmFtZSI6Ik1lYWwgQVBJIFRlc3QgQm90IiwidHYiOjAsImlhdCI6MTc3Mjg2MzU2OCwiZXhwIjoxNzczNDY4MzY4fQ.Fh4IxUZF6gG0_KP3jBfZ95V2nYu50I0lrBKlMOVYACY"}
```

## POST /meal-assistant/suggest-dishes
- Status: 502
- Request type: multipart/form-data
- Fields: image, locale=en, constraints=high protein, inputImageUrl=https://storage.googleapis.com/nutrition-assistant-test-bucket/image-to-test.jpg

```json
{"message":"Gemini request failed with status 404","error":"Bad Gateway","statusCode":502}
```

## POST /meal-assistant/generate-recipe
- Status: 401
- Request body:

```json
{"servings":2,"analysisToken":"invalid.analysis.token","selectedDishId":"dish_1","preferences":"high protein, less oil"}
```

- Raw response:

```json
{"message":"Invalid token signature","error":"Unauthorized","statusCode":401}
```

## POST /meal-assistant/save
- Status: 401
- Request body:

```json
{"note":"Automated API raw test with docs/image-to-test.jpg","cookedImageUrl":"https://storage.googleapis.com/nutrition-assistant-test-bucket/cooked-image-to-test.jpg","ateAt":"2026-03-07T06:06:09Z","analysisToken":"invalid.analysis.token","rating":5,"recipeToken":"invalid.recipe.token"}
```

- Raw response:

```json
{"message":"Invalid token signature","error":"Unauthorized","statusCode":401}
```

## GET /meal-assistant/history?page=1&pageSize=10
- Status: 200

```json
{"items":[],"page":1,"pageSize":10,"total":0}
```

## GET /meal-assistant/history/:id
- Requested id: 00000000-0000-0000-0000-000000000000
- Status: 404

```json
{"message":"Saved recipe not found","error":"Not Found","statusCode":404}
```

