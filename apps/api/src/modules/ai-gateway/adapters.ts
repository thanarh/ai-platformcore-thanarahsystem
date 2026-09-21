import { ToolAdapter, ToolContract, ToolExecutionContext, ToolId } from './tool.types';

export class ToolExecutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class ThanarahCoreAdapter implements ToolAdapter {
  readonly name = 'ThanarahCoreAdapter';
  readonly source = 'thanarah_core' as const;

  async execute(
    _tool: ToolContract,
    _args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    throw new ToolExecutionError(
      'CORE_CONTRACT_UNAVAILABLE',
      'Thanarah Core API contract is not available in this environment',
    );
  }
}

export class MockThanarahCoreAdapter implements ToolAdapter {
  readonly name = 'MockThanarahCoreAdapter';
  readonly source = 'mock_thanarah_core' as const;

  async execute(
    tool: ToolContract,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const tenant = context.tenantId;
    const data: Record<ToolId, unknown> = {
      get_appointments: {
        appointments: [
          {
            id: 'mock-appointment-001',
            tenantId: tenant,
            date: args.date,
            status: args.status || 'scheduled',
            doctorId: args.doctorId || 'mock-doctor-001',
            testData: true,
          },
        ],
      },
      get_doctors: {
        doctors: [
          {
            id: 'mock-doctor-001',
            name: 'Mock Doctor',
            specialty: args.specialty || 'general',
            active: args.active ?? true,
            testData: true,
          },
        ],
      },
      get_services: {
        services: [
          {
            id: 'mock-service-001',
            name: 'Mock consultation',
            category: args.category || 'general',
            active: args.active ?? true,
            testData: true,
          },
        ],
      },
      get_working_hours: {
        date: args.date,
        hours: [{ day: 'weekday', opensAt: '09:00', closesAt: '17:00' }],
        testData: true,
      },
      get_insurance: {
        insurance: [
          {
            provider: args.provider || 'Mock Insurance',
            planId: args.planId || 'mock-plan-001',
            accepted: true,
            testData: true,
          },
        ],
      },
      get_clinic_information: {
        section: args.section || 'general',
        clinic: {
          name: 'Mock Clinic',
          description: 'Fixture data only; not Thanarah Core data.',
          testData: true,
        },
      },
    };
    return data[tool.id];
  }
}