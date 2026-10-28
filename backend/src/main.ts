import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { raw } from 'express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { AppModule } from './app.module';

/** The live support chat shares the HTTP port. Only the web app's origin may connect, with its cookies. */
class ChatIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, { ...options, cors: { origin: process.env.FRONTEND_URL, credentials: true }, transports: ['websocket'] });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // LiveKit webhooks are signed over the raw body
  app.use('/api/live/webhook', raw({ type: 'application/webhook+json' }));
  app.useWebSocketAdapter(new ChatIoAdapter(app));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
