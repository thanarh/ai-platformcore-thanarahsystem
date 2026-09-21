import { strict as assert } from 'node:assert';
import { ConfigService } from '@nestjs/config';
import { MockThanarahCoreAdapter, ThanarahCoreAdapter } from './adapters';
import { ToolAuditService } from './audit.service';
import { ToolPermissionService } from './permission.service';
import { CapabilityRoutingService } from './routing.service';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolValidationService } from './tool-validation.service';
import { ToolExecutionContext } from './tool.types';

const config = new ConfigService({
  tooling: {
    gatewayEnabled: true,
    coreToolsEnabled: false,
    mockEnabled: true,
  },
});
const validator = new ToolValidationService();
const registry = new ToolRegistryService(validator);
registry.onModuleInit();
const permissions = new ToolPermissionService();
const routing = new CapabilityRoutingService();
const audit = new ToolAuditService();
const execution = new ToolExecutionService(
  config,
  registry,
  validator,
  permissions,
  routing,
  audit,
  new ThanarahCoreAdapter(),
  new MockThanarahCoreAdapter(),
);

const context: ToolExecutionContext = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  userId: 'user-a',
  conversationId: 'conversation-a',
  requestId: 'request-a',
  permissions: ['appointments.read'],
  isApiKeyAuth: false,
  timezone: 'Asia/Riyadh',
};

class MalformedMockAdapter extends MockThanarahCoreAdapter {
  override async execute(): Promise<unknown> {
    return [];
  }
}

async function main() {
  assert.equal(registry.discover().length, 6);

  const valid = await execution.execute(
    { toolId: 'get_appointments', arguments: { date: '2026-09-21' } },
    context,
  );
  assert.equal(valid.success, true);
  assert.equal(valid.metadata.source, 'mock_thanarah_core');

  const relativeDate = await execution.execute(
    { toolId: 'get_appointments', arguments: { date: 'tomorrow' } },
    context,
  );
  assert.equal(relativeDate.success, true);
  assert.equal(relativeDate.metadata.resolvedArguments?.date, '2026-09-22');
  assert.equal((relativeDate.data as any).appointments[0].date, '2026-09-22');

  const invalid = await execution.execute(
    { toolId: 'get_appointments', arguments: { date: '21-09-2026' } },
    context,
  );
  assert.equal(invalid.success, false);
  assert.equal(invalid.error?.code, 'TOOL_INVALID_ARGUMENTS');

  const forbidden = await execution.execute(
    { toolId: 'get_doctors', arguments: {} },
    context,
  );
  assert.equal(forbidden.error?.code, 'TOOL_FORBIDDEN');

  const unknownField = await execution.execute(
    { toolId: 'get_appointments', arguments: { date: '2026-09-21', tenantId: 'forged' } },
    context,
  );
  assert.equal(unknownField.error?.code, 'TOOL_INVALID_ARGUMENTS');

  const forgedUserField = await execution.execute(
    { toolId: 'get_appointments', arguments: { date: '2026-09-21', userId: 'forged' } },
    context,
  );
  assert.equal(forgedUserField.error?.code, 'TOOL_INVALID_ARGUMENTS');

  registry.disable('get_services');
  assert.equal(registry.discover().length, 5);
  const disabled = await execution.execute(
    { toolId: 'get_services', arguments: {} },
    context,
  );
  assert.equal(disabled.error?.code, 'TOOL_DISABLED');
  registry.enable('get_services');

  const unavailable = await new ToolExecutionService(
    new ConfigService({
      tooling: { gatewayEnabled: true, coreToolsEnabled: false, mockEnabled: false },
    }),
    registry,
    validator,
    permissions,
    routing,
    audit,
    new ThanarahCoreAdapter(),
    new MockThanarahCoreAdapter(),
  ).execute(
    { toolId: 'get_appointments', arguments: { date: '2026-09-21' } },
    context,
  );
  assert.equal(unavailable.error?.code, 'CORE_CONTRACT_UNAVAILABLE');

  const malformedResult = await new ToolExecutionService(
    config,
    registry,
    validator,
    permissions,
    routing,
    audit,
    new ThanarahCoreAdapter(),
    new MalformedMockAdapter(),
  ).execute(
    { toolId: 'get_appointments', arguments: { date: '2026-09-21' } },
    context,
  );
  assert.equal(malformedResult.error?.code, 'TOOL_INVALID_RESULT');

  const apiKeyOwner = await execution.execute(
    { toolId: 'get_doctors', arguments: {} },
    { ...context, role: 'OWNER', isApiKeyAuth: true, permissions: [] },
  );
  assert.equal(apiKeyOwner.error?.code, 'TOOL_FORBIDDEN');

  const events: string[] = [];
  await execution.execute(
    { toolId: 'get_appointments', arguments: { date: '2026-09-21' } },
    context,
    (event) => events.push(event.event),
  );
  assert.deepEqual(events, [
    'tool_proposed',
    'tool_validating',
    'tool_executing',
    'tool_completed',
  ]);

  assert.equal(routing.decide('كم موعد عندي غدًا؟').route, 'thanarah_tool');
  assert.equal(routing.decide('ما آخر أخبار التقنية؟').route, 'web');
  assert.equal(routing.decide('اشرح API').route, 'local');
  assert.equal(
    routing.resolveCalendarDate('tomorrow', 'Asia/Riyadh', new Date('2026-09-21T20:00:00Z')),
    '2026-09-22',
  );

  assert.ok(audit.recent(10).length >= 7);
  console.log('AI Gateway contract tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});