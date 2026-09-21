export type ToolId =
  | 'get_appointments'
  | 'get_doctors'
  | 'get_services'
  | 'get_working_hours'
  | 'get_insurance'
  | 'get_clinic_information';

export type ToolRoute = 'local' | 'web' | 'thanarah_tool';

export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'boolean' | 'number' | 'integer';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: Array<string | number | boolean>;
  format?: 'date' | 'date-time';
  minLength?: number;
}

export interface ToolContract {
  id: ToolId;
  name: string;
  description: string;
  version: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiredPermissions: string[];
  tenantScoped: true;
  userScoped: true;
  enabled: boolean;
  readOnly: true;
}

export interface ToolExecutionContext {
  tenantId: string;
  organizationId: string;
  userId: string;
  conversationId: string;
  requestId: string;
  timezone?: string;
  role?: string;
  permissions: string[];
  isApiKeyAuth: boolean;
}

export interface ToolResultMetadata {
  source: 'thanarah_core' | 'mock_thanarah_core';
  adapter: string;
  retrievedAt: string;
  requestId: string;
  testData?: true;
  resolvedArguments?: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
  metadata: ToolResultMetadata;
}

export interface ToolExecutionRequest {
  toolId: string;
  arguments: Record<string, unknown>;
}

export interface ToolExecutionEvent {
  event:
    | 'tool_proposed'
    | 'tool_validating'
    | 'tool_executing'
    | 'tool_completed'
    | 'tool_failed';
  requestId: string;
  toolId: string;
  status: 'pending' | 'success' | 'error';
  errorCode?: string;
  durationMs?: number;
}

export interface ToolAuditRecord {
  requestId: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  toolId: string;
  timestamp: string;
  status: 'success' | 'error';
  durationMs: number;
  errorCode?: string;
}

export interface ToolAdapter {
  readonly name: string;
  readonly source: 'thanarah_core' | 'mock_thanarah_core';
  execute(
    tool: ToolContract,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown>;
}