import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
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
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary' },
        inputImageUrl: { type: 'string', format: 'uri' },
        locale: { type: 'string', example: 'en' },
        constraints: { type: 'string', example: 'No peanuts, low sodium' },
      },
    },
  })
  async suggestDishes(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body() body: unknown,
  ) {
    const payload = await this.parseSuggestDishesInput(request, body);
    return this.mealAssistantService.suggestDishes(user, payload);
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

  private async parseSuggestDishesInput(
    request: FastifyRequest,
    body: unknown,
  ): Promise<Record<string, unknown>> {
    const multipartRequest = request as FastifyRequest & {
      isMultipart?: () => boolean;
      parts?: () => AsyncIterable<{
        type: 'file' | 'field';
        fieldname: string;
        value?: string;
        mimetype?: string;
        toBuffer?: () => Promise<Buffer>;
      }>;
    };

    if (!multipartRequest.isMultipart?.() || !multipartRequest.parts) {
      return this.ensureRecordBody(body);
    }

    const result: Record<string, unknown> = {};
    let hasImageFile = false;

    for await (const part of multipartRequest.parts()) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') {
          result[part.fieldname] = part.value;
        }
        continue;
      }

      if (part.fieldname !== 'image') {
        throw new BadRequestException('Only "image" file field is allowed');
      }

      if (hasImageFile) {
        throw new BadRequestException('Only one image file is allowed');
      }

      if (!part.toBuffer) {
        throw new BadRequestException('Invalid multipart file payload');
      }

      const buffer = await part.toBuffer();
      if (buffer.length === 0) {
        throw new BadRequestException('image file cannot be empty');
      }

      hasImageFile = true;
      result.imageBase64 = buffer.toString('base64');
      result.imageMimeType = part.mimetype;
    }

    return result;
  }

  private ensureRecordBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return {};
    }

    return { ...(body as Record<string, unknown>) };
  }
}
