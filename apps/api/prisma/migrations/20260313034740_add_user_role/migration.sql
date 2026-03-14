-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "RecipeImageKind" AS ENUM ('INPUT', 'COOKED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "inputImageUrl" TEXT NOT NULL,
    "recipeTitle" TEXT NOT NULL,
    "selectedDishName" TEXT NOT NULL,
    "selectedDishReason" TEXT NOT NULL,
    "suggestionsJson" JSONB NOT NULL,
    "ingredientsJson" JSONB NOT NULL,
    "stepsJson" JSONB NOT NULL,
    "notesJson" JSONB,
    "nutritionJson" JSONB,
    "modelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeImage" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "kind" "RecipeImageKind" NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeFeedback" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "note" TEXT,
    "ateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recipe_userId_createdAt_idx" ON "Recipe"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecipeImage_recipeId_kind_idx" ON "RecipeImage"("recipeId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeFeedback_recipeId_key" ON "RecipeFeedback"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeFeedback_userId_createdAt_idx" ON "RecipeFeedback"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeImage" ADD CONSTRAINT "RecipeImage_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeFeedback" ADD CONSTRAINT "RecipeFeedback_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeFeedback" ADD CONSTRAINT "RecipeFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
