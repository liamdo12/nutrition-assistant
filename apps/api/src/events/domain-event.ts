export interface DomainEvent<
  TType extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly type: TType;
  readonly timestamp: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly payload: TPayload;
}

export interface PublishDomainEventInput<
  TType extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly type: TType;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly payload: TPayload;
}
