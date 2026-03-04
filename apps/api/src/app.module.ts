import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // In local development, prefer .env.local if present.
      // In production, platform-injected environment variables take precedence.
      envFilePath: ['../../.env.local', '.env.local', '../../.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    EventsModule,
    AuthModule,
    AgentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
