import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './shared/errors/api-exception.filter.js';
import { RequestContextService } from './shared/request-context/request-context.service.js';
import { PrismaService } from './database/prisma.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const express = app.getHttpAdapter().getInstance() as unknown as Express;
  express.disable('x-powered-by');

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalFilters(
    new ApiExceptionFilter(app.get(RequestContextService), app.get(PrismaService)),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Freight Customer Portal API')
    .setDescription('REST API for the Freight Customer Portal modular monolith')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('API_PORT', 4000);
  app.enableShutdownHooks();
  await app.listen(port);
}

void bootstrap();
