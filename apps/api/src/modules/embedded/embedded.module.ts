import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { TenantsModule } from '../tenants/tenants.module';
import { EmbeddedService } from './embedded.service';
import { EmbeddedSessionsService } from './embedded-sessions.service';
import { EmbeddedIntegrationsController, EmbeddedPublicController } from './embedded.controller';
import {
  EmbeddedIntegration, EmbeddedIntegrationSchema, EmbeddedIdentity, EmbeddedIdentitySchema,
  EmbeddedBootstrap, EmbeddedBootstrapSchema, EmbeddedSession, EmbeddedSessionSchema,
} from './schemas/embedded.schema';

@Global()
@Module({
  imports: [
    UsersModule, TenantsModule,
    MongooseModule.forFeature([
      { name: EmbeddedIntegration.name, schema: EmbeddedIntegrationSchema },
      { name: EmbeddedIdentity.name, schema: EmbeddedIdentitySchema },
      { name: EmbeddedBootstrap.name, schema: EmbeddedBootstrapSchema },
      { name: EmbeddedSession.name, schema: EmbeddedSessionSchema },
    ]),
  ],
  controllers: [EmbeddedIntegrationsController, EmbeddedPublicController],
  providers: [EmbeddedService, EmbeddedSessionsService],
  exports: [EmbeddedService, EmbeddedSessionsService],
})
export class EmbeddedModule {}
