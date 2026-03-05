import { Injectable, MessageEvent, NotFoundException } from '@nestjs/common';
import {
  AgentRealtimeEvent,
  agentIngestResponseSchema,
  agentRealtimeEventSchema,
  agentSessionSchema,
  agentSessionStartSchema,
  agentInputEventSchema,
} from '@nutrition/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Observable, map } from 'rxjs';
import { AuthenticatedUser } from '../common/auth/authenticated-user.type';
import { parseWithSchema } from '../common/validation/zod-validation';
import { PrismaService } from '../database/prisma.service';
import { DomainEvent } from '../events/domain-event';
import { DomainEventsService } from '../events/domain-events.service';

interface StoredAgentEvent {
  readonly id: string;
  readonly type: string;
  readonly content: string;
  readonly mimeType?: string;
  readonly correlationId?: string;
  readonly at: string;
}

interface AgentSessionState {
  readonly mode: string;
  readonly locale: string;
  readonly metadata: Record<string, unknown>;
  readonly events: StoredAgentEvent[];
}

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  async startSession(user: AuthenticatedUser, rawInput: unknown) {
    const input = parseWithSchema(agentSessionStartSchema, rawInput);
    const mode = input.mode ?? 'analysis';
    const locale = input.locale ?? 'en-US';
    const sessionData: AgentSessionState = Object.freeze({
      mode,
      locale,
      metadata: input.metadata ?? {},
      events: [],
    });

    const session = await this.prisma.agentSession.create({
      data: {
        userId: user.id,
        sessionData: sessionData as unknown as Prisma.InputJsonValue,
      },
    });

    this.domainEvents.publish({
      type: 'agent.session.started',
      userId: user.id,
      sessionId: session.id,
      payload: {
        mode,
        locale,
      },
    });

    return parseWithSchema(agentSessionSchema, {
      id: session.id,
      userId: session.userId,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
    });
  }

  async ingestInput(user: AuthenticatedUser, sessionId: string, rawInput: unknown) {
    const input = parseWithSchema(agentInputEventSchema, rawInput);
    const session = await this.prisma.agentSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const event: StoredAgentEvent = Object.freeze({
      id: randomUUID(),
      type: input.type,
      content: input.content,
      mimeType: input.mimeType,
      correlationId: input.correlationId,
      at: new Date().toISOString(),
    });

    const currentState = this.normalizeSessionState(session.sessionData);
    const nextState: AgentSessionState = {
      ...currentState,
      events: [...currentState.events.slice(-99), event],
    };

    await this.prisma.agentSession.update({
      where: { id: session.id },
      data: {
        sessionData: nextState as unknown as Prisma.InputJsonValue,
      },
    });

    this.domainEvents.publish({
      type: 'agent.input.received',
      userId: user.id,
      sessionId,
      payload: {
        eventId: event.id,
        type: event.type,
        correlationId: event.correlationId ?? null,
      },
    });

    this.domainEvents.publish({
      type: 'agent.processing.started',
      userId: user.id,
      sessionId,
      payload: {
        eventId: event.id,
      },
    });

    setTimeout(() => {
      this.domainEvents.publish({
        type: 'agent.processing.completed',
        userId: user.id,
        sessionId,
        payload: {
          eventId: event.id,
          summary: this.buildSummary(event.content),
        },
      });
    }, 0);

    return parseWithSchema(agentIngestResponseSchema, {
      accepted: true,
      sessionId,
      eventId: event.id,
      receivedAt: event.at,
    });
  }

  streamRealtime(userId: string): Observable<MessageEvent> {
    return this.domainEvents.streamForUser(userId).pipe(
      map((event): MessageEvent => ({
        id: event.id,
        type: event.type,
        data: this.toRealtimeEvent(event),
      })),
    );
  }

  private toRealtimeEvent(event: DomainEvent): AgentRealtimeEvent {
    return parseWithSchema(agentRealtimeEventSchema, {
      id: event.id,
      type: event.type,
      userId: event.userId,
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      payload: event.payload,
    });
  }

  private normalizeSessionState(raw: unknown): AgentSessionState {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        mode: 'analysis',
        locale: 'en-US',
        metadata: {},
        events: [],
      };
    }

    const objectValue = raw as Record<string, unknown>;
    const mode = typeof objectValue.mode === 'string' ? objectValue.mode : 'analysis';
    const locale = typeof objectValue.locale === 'string' ? objectValue.locale : 'en-US';
    const metadata =
      objectValue.metadata &&
      typeof objectValue.metadata === 'object' &&
      !Array.isArray(objectValue.metadata)
        ? (objectValue.metadata as Record<string, unknown>)
        : {};

    const events = Array.isArray(objectValue.events)
      ? objectValue.events
          .filter(
            event =>
              event &&
              typeof event === 'object' &&
              typeof event.id === 'string' &&
              typeof event.type === 'string' &&
              typeof event.content === 'string' &&
              typeof event.at === 'string',
          )
          .map(
            event =>
              ({
                id: event.id,
                type: event.type,
                content: event.content,
                at: event.at,
                mimeType: typeof event.mimeType === 'string' ? event.mimeType : undefined,
                correlationId:
                  typeof event.correlationId === 'string' ? event.correlationId : undefined,
              }) satisfies StoredAgentEvent,
          )
      : [];

    return {
      mode,
      locale,
      metadata,
      events,
    };
  }

  private buildSummary(content: string): string {
    const sanitized = content.trim().replace(/\s+/g, ' ');
    if (sanitized.length <= 140) {
      return sanitized;
    }

    return `${sanitized.slice(0, 137)}...`;
  }
}
