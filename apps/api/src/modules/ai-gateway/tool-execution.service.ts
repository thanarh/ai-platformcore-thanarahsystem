import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ToolAuditService } from './audit.service';
import { MockThanarahCoreAdapter, ThanarahCoreAdapter, ToolExecutionError } from './adapters';
import { ToolPermissionService } from './permission.service';
import { CapabilityRoutingService } from './routing.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolValidationService } from './tool-validation.service';
import {
  ToolAdapter,
  ToolExecutionContext,
  ToolExecutionEvent,
  ToolExecutionRequest,
  ToolResult,
} from './tool.types';

export type ToolEventListener = (event: ToolExecutionEvent) => void;

@Injectable()
export class ToolExecutionService {
  private readonly logger = new Logger(ToolExecutionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly registry: ToolRegistryService,
    private readonly validator: ToolValidationService,
    private readonly permissions: ToolPermissionService,
    private readonly routing: CapabilityRoutingService,
    private readonly audit: ToolAuditService,
    private readonly coreAdapter: ThanarahCoreAdapter,
    private readonly mockAdapter: MockThanarahCoreAdapter,
  ) {}

  async execute(
    request: ToolExecutionRequest,
    context: ToolExecutionContext,
    onEvent?: ToolEventListener,
  ): Promise<ToolResult> {
    const started = Date.now();
    const toolId = request.toolId;
    const emit = (
      event: ToolExecutionEvent['event'],
      status: ToolExecutionEvent['status'],
      extra: Partial<ToolExecutionEvent> = {},
    ) =>
      onEvent?.({
        event,
        requestId: context.requestId,
        toolId,
        status,
        ...extra,
      });

    emit('tool_proposed', 'pending');
    const tool = this.registry.get(toolId);
    if (!tool) {
      return this.fail(context, toolId, 'TOOL_NOT_FOUND', 'Unknown tool', started, emit);
    }
    if (!tool.enabled) {
      return this.fail(context, toolId, 'TOOL_DISABLED', 'Tool is disabled', started, emit);
    }

    emit('tool_validating', 'pending');
    const normalizedArguments = this.normalizeArguments(request.arguments, context);
    const argumentErrors = this.validator.validateArguments(tool.inputSchema, normalizedArguments);
    if (argumentErrors.length) {
      return this.fail(
        context,
        toolId,
        'TOOL_INVALID_ARGUMENTS',
        argumentErrors.join('; '),
        started,
        emit,
      );
    }
    if (
      !context.tenantId ||
      !context.organizationId ||
      !context.userId ||
      !context.conversationId ||
      !context.requestId
    ) {
      return this.fail(
        context,
        toolId,
        'TOOL_INVALID_CONTEXT',
        'Authenticated tenant, organization, user, conversation, and request context are required',
        started,
        emit,
      );
    }
    if (!this.permissions.canExecute(tool, context)) {
      return this.fail(
        context,
        toolId,
        'TOOL_FORBIDDEN',
        'The authenticated principal lacks the required tool permission',
        started,
        emit,
      );
    }

    if (!this.isGatewayEnabled()) {
      return this.fail(
        context,
        toolId,
        'TOOL_GATEWAY_DISABLED',
        'AI Gateway is disabled',
        started,
        emit,
      );
    }

    const adapter = this.selectAdapter();
    emit('tool_executing', 'pending');
    try {
      const data = await adapter.execute(tool, normalizedArguments, context);
      const resultErrors = this.validator.validateResult(tool.outputSchema, data);
      if (resultErrors.length) {
        throw new ToolExecutionError(
          'TOOL_INVALID_RESULT',
          'Tool returned a result that does not match its output contract',
        );
      }
      const durationMs = Date.now() - started;
      const result: ToolResult = {
        success: true,
        data,
        metadata: {
          source: adapter.source,
          adapter: adapter.name,
          retrievedAt: new Date().toISOString(),
          requestId: context.requestId,
          ...(adapter.source === 'mock_thanarah_core' ? { testData: true as const } : {}),
          ...this.resolvedArgumentMetadata(request.arguments, normalizedArguments),
        },
      };
      this.audit.record({
        requestId: context.requestId,
        tenantId: context.tenantId,
        userId: context.userId,
        conversationId: context.conversationId,
        toolId,
        timestamp: new Date().toISOString(),
        status: 'success',
        durationMs,
      });
      emit('tool_completed', 'success', { durationMs });
      return result;
    } catch (error) {
      const toolError =
        error instanceof ToolExecutionError
          ? error
          : new ToolExecutionError('TOOL_EXECUTION_FAILED', 'Tool execution failed');
      this.logger.warn(`${toolId} failed: ${toolError.code}`);
      return this.fail(context, toolId, toolError.code, toolError.message, started, emit);
    }
  }

  private isGatewayEnabled(): boolean {
    return this.config.get<boolean>('tooling.gatewayEnabled') !== false;
  }

  private selectAdapter(): ToolAdapter {
    const coreEnabled = this.config.get<boolean>('tooling.coreToolsEnabled') === true;
    const mockEnabled = this.config.get<boolean>('tooling.mockEnabled') === true;
    if (coreEnabled) return this.coreAdapter;
    if (mockEnabled) return this.mockAdapter;
    return new ThanarahCoreAdapter();
  }

  private normalizeArguments(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Record<string, unknown> {
    const normalized = { ...args };
    if (typeof normalized.date === 'string') {
      normalized.date = this.routing.resolveCalendarDate(
        normalized.date,
        context.timezone || 'UTC',
      );
    }
    return normalized;
  }

  private resolvedArgumentMetadata(
    original: Record<string, unknown>,
    normalized: Record<string, unknown>,
  ): { resolvedArguments?: Record<string, unknown> } {
    if (original.date === normalized.date) return {};
    return { resolvedArguments: { date: normalized.date } };
  }

  private fail(
    context: ToolExecutionContext,
    toolId: string,
    code: string,
    message: string,
    started: number,
    emit: (
      event: ToolExecutionEvent['event'],
      status: ToolExecutionEvent['status'],
      extra?: Partial<ToolExecutionEvent>,
    ) => void,
  ): ToolResult {
    const durationMs = Date.now() - started;
    this.audit.record({
      requestId: context.requestId || uuidv4(),
      tenantId: context.tenantId || 'unknown',
      userId: context.userId || 'unknown',
      conversationId: context.conversationId || 'unknown',
      toolId,
      timestamp: new Date().toISOString(),
      status: 'error',
      durationMs,
      errorCode: code,
    });
    emit('tool_failed', 'error', { errorCode: code, durationMs });
    return {
      success: false,
      error: { code, message },
      metadata: {
        source: 'thanarah_core',
        adapter: 'ThanarahCoreAdapter',
        retrievedAt: new Date().toISOString(),
        requestId: context.requestId || uuidv4(),
      },
    };
  }
}