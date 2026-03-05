import {
  Body,
  Controller,
  HttpCode,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { AuthenticatedUser } from '../common/auth/authenticated-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentService } from './agent.service';

@ApiTags('agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Start a realtime multimodal agent session' })
  startSession(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.agentService.startSession(user, body);
  }

  @Post('sessions/:sessionId/events')
  @HttpCode(202)
  @ApiOperation({ summary: 'Ingest an event into an active agent session' })
  ingestEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
  ) {
    return this.agentService.ingestInput(user, sessionId, body);
  }

  @Sse('events/stream')
  @ApiOperation({ summary: 'Subscribe to realtime agent events (SSE)' })
  streamEvents(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.agentService.streamRealtime(user.id);
  }
}
