import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { AiModule } from './modules/ai/ai.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AdminModule } from './modules/admin/admin.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { UsageModule } from './modules/usage/usage.module';
import { HealthModule } from './modules/health/health.module';
import { EmailModule } from './modules/email/email.module';
import { ReportModule } from './modules/email/report.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Cron / scheduled tasks
    ScheduleModule.forRoot(),

    // Database — non-blocking startup via lazyConnection.
    MongooseModule.forRoot(process.env.MONGODB_URI, {
      dbName: 'thanarah_ai',
      tls: true,
      bufferCommands: true,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      lazyConnection: true,
      onConnectionCreate: (connection: any) => {
        connection.on('error', (err: Error) =>
          console.warn('⚠️  MongoDB error (retrying in background):', err.message.slice(0, 80)),
        );
        connection.on('connected', () => console.log('✅ MongoDB Atlas connected'));
      },
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Feature modules
    AuthModule,
    UsersModule,
    TenantsModule,
    ConversationsModule,
    MessagesModule,
    AiModule,
    ApiKeysModule,
    AdminModule,
    KnowledgeModule,
    UsageModule,
    HealthModule,

    // Email & scheduled reports
    EmailModule,
    ReportModule,
  ],
})
export class AppModule {}
