import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { patchNestJsSwagger } from 'nestjs-zod';
import { AppModule } from './app.module';
import { AppConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );
  const configService = app.get(ConfigService<AppConfig, true>);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // CORS
  const nodeEnv = configService.get('NODE_ENV', { infer: true });
  const allowedOrigins = configService.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: nodeEnv === 'production' ? allowedOrigins : true,
    credentials: true,
  });

  // Swagger
  patchNestJsSwagger();
  const config = new DocumentBuilder()
    .setTitle('Nutrition Assistant API')
    .setDescription('AI-powered nutrition tracking API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

bootstrap();
