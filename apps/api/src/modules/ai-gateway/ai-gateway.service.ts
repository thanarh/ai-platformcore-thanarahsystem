import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { CapabilityRoutingService } from './routing.service';
import { ToolExecutionService, ToolEventListener } from './tool-execution.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionContext, ToolResult } from './tool.types';

@Injectable()
export class AiGatewayService {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly execution: ToolExecutionService,
    private readonly routing: CapabilityRoutingService,
    private readonly config: ConfigService,
  ) {}

  discover(user: any) {
    this.assertPrincipal(user);
    return {
      availableTools: this.registry.discover(),
      executionMode: 'contract_only',
      coreIntegrationAvailable: this.config.get<boolean>('tooling.coreToolsEnabled') === true,
    };
  }

  capabilities(user: any) {
    this.assertPrincipal(user);
    return {
      availableTools: this.registry.discover().map((tool) => tool.id),
      routes: ['local', 'web', 'thanarah_tool'],
      gatewayEnabled: this.config.get<boolean>('tooling.gatewayEnabled') !== false,
      coreToolsEnabled: this.config.get<boolean>('tooling.coreToolsEnabled') === true,
      mockExecutionEnabled: this.config.get<boolean>('tooling.mockEnabled') === true,
      executionMode: 'contract_only',
    };
  }

  route(user: any, query: string) {
    this.assertPrincipal(user);
    return this.routing.decide(query || '');
  }

  execute(
    user: any,
    body: ExecuteToolDto,
    onEvent?: ToolEventListener,
  ): Promise<ToolResult> {
    const context = this.buildContext(user, body.conversationId);
    return this.execution.execute(
      { toolId: body.toolId, arguments: body.arguments || {} },
      context,
      onEvent,
    );
  }

  private buildContext(user: any, conversationId: string): ToolExecutionContext {
    this.assertPrincipal(user);
    return {
      tenantId: String(user.tenantId),
      organizationId: String(user.organizationId || user.tenantId),
      userId: String(user._id),
      conversationId,
      requestId: uuidv4(),
      timezone: String(user.timezone || user.runtimeContext?.timezone || 'UTC'),
      role: user.role,
      permissions: Array.isArray(user.apiKeyScopes)
        ? user.apiKeyScopes.map((permission: unknown) => String(permission))
        : Array.isArray(user.permissions)
          ? user.permissions.map((permission: unknown) => String(permission))
          : [],
      isApiKeyAuth: user.isApiKeyAuth === true,
    };
  }

  private assertPrincipal(user: any): void {
    if (!user?._id || !user?.tenantId) {
      throw new UnauthorizedException('Authenticated tenant and user context required');
    }
  }
}