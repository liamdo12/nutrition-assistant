import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, Subject, filter } from 'rxjs';
import { DomainEvent, PublishDomainEventInput } from './domain-event';

@Injectable()
export class DomainEventsService {
  private readonly eventSubject = new Subject<DomainEvent>();

  publish<TType extends string, TPayload extends Record<string, unknown>>(
    input: PublishDomainEventInput<TType, TPayload>,
  ): DomainEvent<TType, TPayload> {
    const event: DomainEvent<TType, TPayload> = Object.freeze({
      id: randomUUID(),
      type: input.type,
      timestamp: new Date().toISOString(),
      userId: input.userId,
      sessionId: input.sessionId,
      payload: input.payload,
    });

    this.eventSubject.next(event);
    return event;
  }

  streamAll(): Observable<DomainEvent> {
    return this.eventSubject.asObservable();
  }

  streamForUser(userId: string): Observable<DomainEvent> {
    return this.eventSubject.asObservable().pipe(
      filter(event => !event.userId || event.userId === userId),
    );
  }
}
