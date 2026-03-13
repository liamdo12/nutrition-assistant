import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MealAssistantController } from './meal-assistant.controller';
import { FirebaseStorageUrlService } from './firebase-storage-url.service';
import { GeminiService } from './gemini.service';
import { MealDraftTokenService } from './meal-draft-token.service';
import { MealAssistantService } from './meal-assistant.service';
import { SharedMealContextService } from './shared-meal-context.service';

@Module({
  imports: [AuthModule],
  controllers: [MealAssistantController],
  providers: [
    MealAssistantService,
    MealDraftTokenService,
    FirebaseStorageUrlService,
    GeminiService,
    SharedMealContextService,
  ],
  exports: [GeminiService, MealDraftTokenService, SharedMealContextService],
})
export class MealAssistantModule {}
