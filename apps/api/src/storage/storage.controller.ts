import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../common/auth/authenticated-user.type';
import { PrismaService } from '../database/prisma.service';
import { SIGNED_URL_UPLOAD_EXPIRY_MS, SIGNED_URL_DOWNLOAD_EXPIRY_MS } from './storage.constants';

@Controller('nutrition-logs')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('upload-url')
  async getUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { contentType: string },
  ) {
    if (!this.storageService.isEnabled()) {
      throw new BadRequestException('Image storage is not configured');
    }

    const { signedUrl, objectPath } = await this.storageService.generateUploadUrl(
      user.id,
      body.contentType,
    );

    return {
      signedUrl,
      objectPath,
      expiresIn: SIGNED_URL_UPLOAD_EXPIRY_MS / 1000,
    };
  }

  @Post(':id/confirm-image')
  async confirmImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { objectPath: string },
  ) {
    // Validate object path belongs to the authenticated user
    const expectedPrefix = `users/${user.id}/`;
    if (!body.objectPath.startsWith(expectedPrefix)) {
      throw new BadRequestException('Object path does not belong to the authenticated user');
    }

    const log = await this.prisma.nutritionLog.findFirst({
      where: { id, userId: user.id },
    });
    if (!log) {
      throw new NotFoundException('Nutrition log not found');
    }

    const exists = await this.storageService.fileExists(body.objectPath);
    if (!exists) {
      throw new BadRequestException('File not found in storage');
    }

    const updated = await this.prisma.nutritionLog.update({
      where: { id },
      data: { imagePath: body.objectPath },
    });

    return updated;
  }

  @Get(':id/image-url')
  async getImageUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const log = await this.prisma.nutritionLog.findFirst({
      where: { id, userId: user.id },
    });
    if (!log) {
      throw new NotFoundException('Nutrition log not found');
    }
    if (!log.imagePath) {
      throw new NotFoundException('No image attached to this log');
    }

    const url = await this.storageService.generateDownloadUrl(log.imagePath);

    return {
      url,
      expiresIn: SIGNED_URL_DOWNLOAD_EXPIRY_MS / 1000,
    };
  }
}
