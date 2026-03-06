import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../common/auth/authenticated-user.type';
import { MealAssistantService } from './meal-assistant.service';

@ApiTags('meal-assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('meal-assistant')
export class MealAssistantController {
  constructor(private readonly mealAssistantService: MealAssistantService) {}

  @Post('suggest-dishes')
  @ApiOperation({ summary: 'Analyze ingredient image and suggest 5 dishes' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['inputImageUrl'],
      properties: {
        inputImageUrl: { type: 'string', format: 'uri' },
        locale: { type: 'string', example: 'en' },
        constraints: { type: 'string', example: 'No peanuts, low sodium' },
      },
    },
  })
  suggestDishes(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.mealAssistantService.suggestDishes(user, body);
  }

  @Post('generate-recipe')
  @ApiOperation({ summary: 'Generate recipe from selected dish suggestion' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['analysisToken', 'selectedDishId'],
      properties: {
        analysisToken: { type: 'string' },
        selectedDishId: { type: 'string' },
        servings: { type: 'number', example: 2 },
        preferences: { type: 'string', example: 'High protein' },
      },
    },
  })
  generateRecipe(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.mealAssistantService.generateRecipe(user, body);
  }

  @Post('save')
  @ApiOperation({ summary: 'Persist selected recipe, cooked image and feedback' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['analysisToken', 'recipeToken', 'cookedImageUrl', 'rating'],
      properties: {
        analysisToken: { type: 'string' },
        recipeToken: { type: 'string' },
        cookedImageUrl: { type: 'string', format: 'uri' },
        rating: { type: 'number', minimum: 1, maximum: 5 },
        note: { type: 'string' },
        ateAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  save(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.mealAssistantService.save(user, body);
  }

  @Get('history')
  @ApiOperation({ summary: 'List saved cooking records' })
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.mealAssistantService.getHistory(user, query);
  }

  @Get('history/:id')
  @ApiOperation({ summary: 'Get detail for one saved cooking record' })
  historyDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mealAssistantService.getHistoryDetail(user, id);
  }
}
