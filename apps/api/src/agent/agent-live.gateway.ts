import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  mealLiveClientAudioChunkSchema,
  mealLiveClientContextSyncSchema,
  mealLiveClientTextInputSchema,
  mealLiveServerContextSyncedSchema,
  mealLiveServerErrorSchema,
  mealLiveServerModelAudioChunkSchema,
  mealLiveServerModelTextSchema,
  mealLiveServerSessionClosedSchema,
  mealLiveServerTranscriptFinalSchema,
  mealLiveServerTranscriptPartialSchema,
} from '@nutrition/shared';
import { AuthTokenService } from '../common/security/auth-token.service';
import { parseWithSchema } from '../common/validation/zod-validation';
import { DomainEventsService } from '../events/domain-events.service';
import { AuthRepository } from '../auth/auth.repository';
import { GeminiLiveSession, GeminiService } from '../meal-assistant/gemini.service';
import { MealDraftTokenService } from '../meal-assistant/meal-draft-token.service';
import { SharedMealContextService } from '../meal-assistant/shared-meal-context.service';

interface LiveSocketData {
  userId: string;
  session: GeminiLiveSession;
  contextVersion: number;
}

@WebSocketGateway({
  namespace: '/api/v1/agent/live',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class AgentLiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(AgentLiveGateway.name);

  constructor(
    private readonly tokenService: AuthTokenService,
    private readonly authRepository: AuthRepository,
    private readonly domainEvents: DomainEventsService,
    private readonly geminiService: GeminiService,
    private readonly mealDraftTokenService: MealDraftTokenService,
    private readonly sharedMealContextService: SharedMealContextService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = this.tokenService.verify(token);
      const user = await this.authRepository.findById(payload.sub);
      if (!user || user.tokenVersion !== payload.tv) {
        throw new UnauthorizedException('Invalid authentication token');
      }

      const revoked = await this.authRepository.isTokenRevoked(payload.jti, new Date());
      if (revoked) {
        throw new UnauthorizedException('Authentication token is no longer valid');
      }

      client.data.live = this.createLiveSocketData(client, user.id);

      this.domainEvents.publish({
        type: 'agent.live.connected',
        userId: user.id,
        payload: {
          socketId: client.id,
        },
      });
    } catch (error) {
      this.logger.warn(`WS connection rejected: ${error instanceof Error ? error.message : 'unknown'}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const data = client.data.live as LiveSocketData | undefined;
    if (!data) {
      return;
    }

    await data.session.close('socket_disconnected');
    this.domainEvents.publish({
      type: 'agent.live.disconnected',
      userId: data.userId,
      payload: {
        socketId: client.id,
      },
    });
  }

  @SubscribeMessage('text_input')
  async onTextInput(@ConnectedSocket() client: Socket, @MessageBody() rawBody: unknown): Promise<void> {
    const data = await this.ensureFreshSession(client);
    if (!data) {
      client.disconnect(true);
      return;
    }

    const body = parseWithSchema(mealLiveClientTextInputSchema, rawBody);
    this.sharedMealContextService.mergeTextTurn(data.userId, 'user', body.text);
    const sharedContext = this.sharedMealContextService.buildPromptContext(data.userId);
    const composedInput = sharedContext
      ? `${sharedContext}\n\nLatest user message:\n${body.text}`
      : body.text;
    await data.session.sendTextInput(composedInput);
  }

  @SubscribeMessage('audio_chunk')
  async onAudioChunk(@ConnectedSocket() client: Socket, @MessageBody() rawBody: unknown): Promise<void> {
    const data = await this.ensureFreshSession(client);
    if (!data) {
      client.disconnect(true);
      return;
    }

    const body = parseWithSchema(mealLiveClientAudioChunkSchema, rawBody);
    await data.session.sendAudioChunk(body.chunkBase64, body.mimeType);
  }

  @SubscribeMessage('end_turn')
  async onEndTurn(@ConnectedSocket() client: Socket): Promise<void> {
    const data = await this.ensureFreshSession(client);
    if (!data) {
      client.disconnect(true);
      return;
    }

    await data.session.endTurn();
  }

  @SubscribeMessage('meal_context')
  async onMealContext(@ConnectedSocket() client: Socket, @MessageBody() rawBody: unknown): Promise<void> {
    const data = await this.ensureFreshSession(client);
    if (!data) {
      client.disconnect(true);
      return;
    }

    const body = parseWithSchema(mealLiveClientContextSyncSchema, rawBody);
    const analysisPayload = this.mealDraftTokenService.verifyAnalysisToken(body.analysisToken, data.userId);
    const selectedDish = body.selectedDishId
      ? analysisPayload.data.suggestions.find(dish => dish.id === body.selectedDishId)
      : undefined;

    this.sharedMealContextService.mergeImageAnalysis(data.userId, {
      locale: analysisPayload.data.locale,
      constraints: analysisPayload.data.constraints,
      suggestions: analysisPayload.data.suggestions,
    });
    this.sharedMealContextService.mergeMealSelection(data.userId, {
      selectedDishId: selectedDish?.id ?? null,
      selectedDishName: selectedDish?.name ?? null,
      preferences: body.preferences,
    });

    const lines = [
      'Conversation context update for meal assistant.',
      'Use this context for all next user turns unless user asks to reset topic.',
      this.sharedMealContextService.buildPromptContext(data.userId),
      `Locale: ${analysisPayload.data.locale}`,
      `Constraints: ${analysisPayload.data.constraints ?? 'none'}`,
      'Dish suggestions:',
      ...analysisPayload.data.suggestions.map(
        (dish, index) => `${index + 1}. ${dish.name} - ${dish.reason}`,
      ),
      `Selected dish: ${selectedDish?.name ?? 'not selected yet'}`,
      `Preferences: ${body.preferences ?? 'none'}`,
      'Acknowledge this context in one short sentence.',
    ];

    await data.session.sendTextInput(lines.filter(Boolean).join('\n'));

    const synced = parseWithSchema(mealLiveServerContextSyncedSchema, {
      analysisJti: analysisPayload.jti,
      selectedDishId: selectedDish?.id ?? null,
      suggestionsCount: analysisPayload.data.suggestions.length,
    });
    client.emit('meal_context_synced', synced);

    this.domainEvents.publish({
      type: 'agent.live.context.synced',
      userId: data.userId,
      payload: {
        socketId: client.id,
        analysisJti: analysisPayload.jti,
        selectedDishId: selectedDish?.id ?? null,
      },
    });
  }

  private extractToken(client: Socket): string {
    const handshakeAuth = client.handshake.auth as { token?: string } | undefined;
    if (handshakeAuth?.token && typeof handshakeAuth.token === 'string') {
      return handshakeAuth.token;
    }

    const headerToken = this.tokenService.extractBearerToken(
      (client.handshake.headers.authorization as string | undefined) ?? undefined,
    );
    return headerToken;
  }

  private createLiveSocketData(client: Socket, userId: string): LiveSocketData {
    const liveSession = this.geminiService.openLiveAudioSession(
      {
        locale: 'en',
        userId,
        sharedContext: this.sharedMealContextService.buildPromptContext(userId),
      },
      {
        onTranscriptPartial: text => {
          const data = parseWithSchema(mealLiveServerTranscriptPartialSchema, { text });
          client.emit('transcript_partial', data);
        },
        onTranscriptFinal: text => {
          this.sharedMealContextService.mergeTextTurn(userId, 'user', text);
          const data = parseWithSchema(mealLiveServerTranscriptFinalSchema, { text });
          client.emit('transcript_final', data);
        },
        onModelText: text => {
          this.sharedMealContextService.mergeTextTurn(userId, 'model', text);
          const data = parseWithSchema(mealLiveServerModelTextSchema, { text });
          client.emit('model_text', data);
        },
        onModelAudioChunk: (chunkBase64, mimeType) => {
          const data = parseWithSchema(mealLiveServerModelAudioChunkSchema, {
            chunkBase64,
            mimeType,
          });
          client.emit('model_audio_chunk', data);
        },
        onError: (code, message) => {
          const data = parseWithSchema(mealLiveServerErrorSchema, { code, message });
          client.emit('error', data);
          this.domainEvents.publish({
            type: 'agent.live.error',
            userId,
            payload: { code },
          });
        },
        onClosed: reason => {
          const data = parseWithSchema(mealLiveServerSessionClosedSchema, { reason });
          client.emit('session_closed', data);
        },
      },
    );

    return {
      userId,
      session: liveSession,
      contextVersion: this.sharedMealContextService.getVersion(userId),
    };
  }

  private async ensureFreshSession(client: Socket): Promise<LiveSocketData | undefined> {
    const current = client.data.live as LiveSocketData | undefined;
    if (!current) {
      return undefined;
    }

    const latestVersion = this.sharedMealContextService.getVersion(current.userId);
    if (current.contextVersion === latestVersion) {
      return current;
    }

    await current.session.close('context_reset');
    const refreshed = this.createLiveSocketData(client, current.userId);
    client.data.live = refreshed;
    return refreshed;
  }
}
