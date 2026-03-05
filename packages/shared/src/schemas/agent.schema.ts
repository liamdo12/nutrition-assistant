import { z } from 'zod';

export const agentEventTypeSchema = z.enum(['text', 'image', 'audio', 'system']);

export const agentSessionStartSchema = z.object({
  mode: z.enum(['analysis', 'coaching']).default('analysis'),
  locale: z.string().trim().min(2).max(20).default('en-US'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const agentSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
});

export const agentInputEventSchema = z.object({
  type: agentEventTypeSchema.exclude(['system']),
  content: z.string().trim().min(1).max(4000),
  mimeType: z.string().trim().min(3).max(120).optional(),
  correlationId: z.string().trim().min(1).max(120).optional(),
});

export const agentIngestResponseSchema = z.object({
  accepted: z.literal(true),
  sessionId: z.string().uuid(),
  eventId: z.string(),
  receivedAt: z.string().datetime(),
});

export const agentRealtimeEventSchema = z.object({
  id: z.string(),
  type: z.string().min(1),
  userId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export type AgentSessionStartInput = z.infer<typeof agentSessionStartSchema>;
export type AgentSessionDto = z.infer<typeof agentSessionSchema>;
export type AgentInputEventInput = z.infer<typeof agentInputEventSchema>;
export type AgentIngestResponse = z.infer<typeof agentIngestResponseSchema>;
export type AgentRealtimeEvent = z.infer<typeof agentRealtimeEventSchema>;
