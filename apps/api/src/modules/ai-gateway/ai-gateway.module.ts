import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiGatewayController } from './ai-gateway.controller';
import { MockThanarahCoreAdapter, ThanarahCoreAdapter } from './adapters';
import { ToolAuditService } from './audit.service';
import { ToolPermissionService } from './permission.service';
import { CapabilityRoutingService } from './routing.service';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolValidationService } from './tool-validation.service';

@Module({
  imports: [ConfigModule],
  controllers: [AiGatewayController],
  providers: [
    ToolValidationService,
    ToolRegistryService,
    ToolPermissionService,
    ToolAuditService,
    ToolExecutionService,
    CapabilityRoutingService,
    ThanarahCoreAdapter,
    MockThanarahCoreAdapter,
  ],
  exports: [
    ToolRegistryService,
    ToolExecutionService,
    CapabilityRoutingService,
  ],
})
export class AiGatewayModule {}