import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as compression from 'compression';

// MongoDB Atlas connection errors (e.g. IP not yet whitelisted) must not crash
// the API process.  NestJS uses lazyConnection so the server is fully functional
// for non-DB routes; DB routes return errors until Atlas is reachable.
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes('MongoServerSelectionError') || msg.includes('MongoNetworkError') || msg.includes('SSL')) {
    console.warn('⚠️  MongoDB not reachable (connection will retry):', msg.slice(0, 120));
  } else {
    console.error('Unhandled rejection:', reason);
  }
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Security
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  // CORS — allow Next.js frontend and direct API calls
  app.enableCors({
    origin: [
      'http://localhost:5000',
      'http://localhost:3000',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  // Swagger API docs (development only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Thanarah AI API')
      .setDescription('Thanarah AI — Backend API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.API_PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🌿 Thanarah AI API running on port ${port}`);
  console.log(`📚 API docs: http://localhost:${port}/api/docs`);
}

bootstrap();
