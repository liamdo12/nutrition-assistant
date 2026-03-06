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
  mealLiveClientTextInputSchema,
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

interface LiveSocketData {
  userId: string;
  session: GeminiLiveSession;
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

      const liveSession = this.geminiService.openLiveAudioSession(
        {
          locale: 'en',
          userId: user.id,
        },
        {
          onTranscriptPartial: text => {
            const data = parseWithSchema(mealLiveServerTranscriptPartialSchema, { text });
            client.emit('transcript_partial', data);
          },
          onTranscriptFinal: text => {
            const data = parseWithSchema(mealLiveServerTranscriptFinalSchema, { text });
            client.emit('transcript_final', data);
          },
          onModelText: text => {
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
              userId: user.id,
              payload: { code },
            });
          },
          onClosed: reason => {
            const data = parseWithSchema(mealLiveServerSessionClosedSchema, { reason });
            client.emit('session_closed', data);
          },
        },
      );

      client.data.live = {
        userId: user.id,
        session: liveSession,
      } satisfies LiveSocketData;

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
    const data = client.data.live as LiveSocketData | undefined;
    if (!data) {
      client.disconnect(true);
      return;
    }

    const body = parseWithSchema(mealLiveClientTextInputSchema, rawBody);
    await data.session.sendTextInput(body.text);
  }

  @SubscribeMessage('audio_chunk')
  async onAudioChunk(@ConnectedSocket() client: Socket, @MessageBody() rawBody: unknown): Promise<void> {
    const data = client.data.live as LiveSocketData | undefined;
    if (!data) {
      client.disconnect(true);
      return;
    }

    const body = parseWithSchema(mealLiveClientAudioChunkSchema, rawBody);
    await data.session.sendAudioChunk(body.chunkBase64, body.mimeType);
  }

  @SubscribeMessage('end_turn')
  async onEndTurn(@ConnectedSocket() client: Socket): Promise<void> {
    const data = client.data.live as LiveSocketData | undefined;
    if (!data) {
      client.disconnect(true);
      return;
    }

    await data.session.endTurn();
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
}
