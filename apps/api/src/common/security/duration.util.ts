import { InternalServerErrorException } from '@nestjs/common';

const durationRegex = /^(\d+)([smhd])$/;

const multiplierByUnit: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export function parseDurationToSeconds(duration: string, context: string): number {
  const match = durationRegex.exec(duration);
  if (!match) {
    throw new InternalServerErrorException(`${context} is invalid`);
  }

  const value = Number(match[1]);
  const unit = match[2];
  return value * multiplierByUnit[unit];
}
