import { JsonSchema, ToolContract, ToolId } from './tool.types';

const objectSchema = (
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const emptyOutput = objectSchema({
  data: { type: 'object', additionalProperties: true },
});

export const TOOL_CONTRACTS: readonly ToolContract[] = [
  {
    id: 'get_appointments',
    name: 'Get appointments',
    description: 'Read appointments for the authenticated tenant and user scope.',
    version: '1.0.0',
    inputSchema: objectSchema(
      {
        date: { type: 'string', format: 'date' },
        doctorId: { type: 'string', minLength: 1 },
        status: {
          type: 'string',
          enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'],
        },
      },
      ['date'],
    ),
    outputSchema: emptyOutput,
    requiredPermissions: ['appointments.read'],
    tenantScoped: true,
    userScoped: true,
    enabled: true,
    readOnly: true,
  },
  {
    id: 'get_doctors',
    name: 'Get doctors',
    description: 'Read doctors available to the authenticated tenant.',
    version: '1.0.0',
    inputSchema: objectSchema({
      specialty: { type: 'string', minLength: 1 },
      active: { type: 'boolean' },
    }),
    outputSchema: emptyOutput,
    requiredPermissions: ['doctors.read'],
    tenantScoped: true,
    userScoped: true,
    enabled: true,
    readOnly: true,
  },
  {
    id: 'get_services',
    name: 'Get services',
    description: 'Read services configured for the authenticated tenant.',
    version: '1.0.0',
    inputSchema: objectSchema({
      category: { type: 'string', minLength: 1 },
      active: { type: 'boolean' },
    }),
    outputSchema: emptyOutput,
    requiredPermissions: ['services.read'],
    tenantScoped: true,
    userScoped: true,
    enabled: true,
    readOnly: true,
  },
  {
    id: 'get_working_hours',
    name: 'Get working hours',
    description: 'Read working hours for a tenant on a calendar date.',
    version: '1.0.0',
    inputSchema: objectSchema(
      { date: { type: 'string', format: 'date' } },
      ['date'],
    ),
    outputSchema: emptyOutput,
    requiredPermissions: ['working_hours.read'],
    tenantScoped: true,
    userScoped: true,
    enabled: true,
    readOnly: true,
  },
  {
    id: 'get_insurance',
    name: 'Get insurance',
    description: 'Read insurance providers and plans available to the tenant.',
    version: '1.0.0',
    inputSchema: objectSchema({
      provider: { type: 'string', minLength: 1 },
      planId: { type: 'string', minLength: 1 },
    }),
    outputSchema: emptyOutput,
    requiredPermissions: ['insurance.read'],
    tenantScoped: true,
    userScoped: true,
    enabled: true,
    readOnly: true,
  },
  {
    id: 'get_clinic_information',
    name: 'Get clinic information',
    description: 'Read non-sensitive clinic information for the tenant.',
    version: '1.0.0',
    inputSchema: objectSchema({
      section: {
        type: 'string',
        enum: ['general', 'contact', 'location', 'policies'],
      },
    }),
    outputSchema: emptyOutput,
    requiredPermissions: ['clinic.read'],
    tenantScoped: true,
    userScoped: true,
    enabled: true,
    readOnly: true,
  },
];

export const TOOL_IDS: readonly ToolId[] = TOOL_CONTRACTS.map((tool) => tool.id);