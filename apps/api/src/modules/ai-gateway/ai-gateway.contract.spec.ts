import assert from 'node:assert/strict';
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
const audit = new ToolAuditService();
const execution = new ToolExecutionService(
  config,
  registry,
  validator,
  permissions,
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
};

async function main() {
  assert.equal(registry.discover().length, 6);

  const valid = await execution.execute(
    { toolId: 'get_appointments', arguments: { date: '2026-09-21' } },
    context,
  );
  assert.equal(valid.success, true);
  assert.equal(valid.metadata.source, 'mock_thanarah_core');

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

  const routing = new CapabilityRoutingService();
  assert.equal(routing.decide('كم موعد عندي غدًا؟').route, 'thanarah_tool');
  assert.equal(routing.decide('ما آخر أخبار التقنية؟').route, 'web');
  assert.equal(routing.decide('اشرح API').route, 'local');
  assert.equal(
    routing.resolveCalendarDate('tomorrow', 'Asia/Riyadh', new Date('2026-09-21T20:00:00Z')),
    '2026-09-22',
  );

  assert.equal(audit.recent(10).length, 5);
  console.log('AI Gateway contract tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});