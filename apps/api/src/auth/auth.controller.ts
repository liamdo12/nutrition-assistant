import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../common/auth/authenticated-user.type';
import { JwtPayload } from '../common/security/auth-token.service';
import { CurrentAuth } from './current-auth.decorator';
import { CurrentUser } from './current-user.decorator';
import {
  AuthResponseDto,
  ForgotPasswordBodyDto,
  ForgotPasswordResponseDto,
  LoginBodyDto,
  LogoutResponseDto,
  RegisterBodyDto,
  ResetPasswordBodyDto,
  ResetPasswordResponseDto,
  UserProfileDto,
} from './dto/auth.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  async register(@Body() body: RegisterBodyDto): Promise<AuthResponseDto> {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  async login(@Body() body: LoginBodyDto): Promise<AuthResponseDto> {
    return this.authService.login(body);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request password reset token' })
  @ApiOkResponse({ type: ForgotPasswordResponseDto })
  async forgotPassword(@Body() body: ForgotPasswordBodyDto): Promise<ForgotPasswordResponseDto> {
    return this.authService.forgotPassword(body);
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password using a one-time reset token' })
  @ApiOkResponse({ type: ResetPasswordResponseDto })
  async resetPassword(@Body() body: ResetPasswordBodyDto): Promise<ResetPasswordResponseDto> {
    return this.authService.resetPassword(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiOkResponse({ type: UserProfileDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.authService.getProfile(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session by revoking current JWT' })
  @ApiOkResponse({ type: LogoutResponseDto })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuth() auth: JwtPayload,
  ): Promise<LogoutResponseDto> {
    return this.authService.logout(user.id, auth);
  }
}
