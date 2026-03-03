import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  rawInput: unknown,
): Readonly<z.output<TSchema>> {
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten());
  }

  return Object.freeze(parsed.data);
}
