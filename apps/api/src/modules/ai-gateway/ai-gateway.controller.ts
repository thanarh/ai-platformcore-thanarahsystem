import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { CapabilityRoutingService } from './routing.service';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionContext } from './tool.types';

@Controller('ai/v1/tools')
@UseGuards(JwtAuthGuard)
export class AiGatewayController {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly execution: ToolExecutionService,
    private readonly routing: CapabilityRoutingService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  discover(@CurrentUser() user: any) {
    this.assertPrincipal(user);
    return {
      availableTools: this.registry.discover(),
      executionMode: 'contract_only',
      coreIntegrationAvailable: this.config.get<boolean>('tooling.coreToolsEnabled') === true,
    };
  }

  @Get('capabilities')
  capabilities(@CurrentUser() user: any) {
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

  @Post('route')
  @HttpCode(200)
  route(@CurrentUser() user: any, @Body('query') query: string) {
    this.assertPrincipal(user);
    return this.routing.decide(query || '');
  }

  @Post('execute')
  @HttpCode(200)
  async execute(@CurrentUser() user: any, @Body() body: ExecuteToolDto) {
    const context = this.buildContext(user, body.conversationId);
    return this.execution.execute(
      { toolId: body.toolId, arguments: body.arguments || {} },
      context,
    );
  }

  @Post('execute/stream')
  async executeStream(
    @CurrentUser() user: any,
    @Body() body: ExecuteToolDto,
    @Res() response: Response,
  ) {
    const context = this.buildContext(user, body.conversationId);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    const write = (event: string, data: unknown) => {
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
      (response as any).flush?.();
    };
    write('status', { state: 'tool_proposed', requestId: context.requestId });
    const result = await this.execution.execute(
      { toolId: body.toolId, arguments: body.arguments || {} },
      context,
      (event) => write(event.event, event),
    );
    write(result.success ? 'done' : 'error', result);
    response.write('data: [DONE]\n\n');
    response.end();
  }

  private buildContext(user: any, conversationId: string): ToolExecutionContext {
    this.assertPrincipal(user);
    return {
      tenantId: String(user.tenantId),
      organizationId: String(user.organizationId || user.tenantId),
      userId: String(user._id),
      conversationId,
      requestId: uuidv4(),
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