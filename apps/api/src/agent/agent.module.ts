import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MealAssistantModule } from '../meal-assistant/meal-assistant.module';
import { AgentLiveGateway } from './agent-live.gateway';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [AuthModule, MealAssistantModule],
  controllers: [AgentController],
  providers: [AgentService, AgentLiveGateway],
})
export class AgentModule {}
