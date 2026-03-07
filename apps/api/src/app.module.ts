import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Runtime configuration comes from process.env only.
      // .env.encrypted is decrypted before bootstrap and injected into process.env.
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    EventsModule,
    AuthModule,
    AgentModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
