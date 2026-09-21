import { Injectable, OnModuleInit } from '@nestjs/common';
import { TOOL_CONTRACTS } from './tool-contracts';
import { ToolContract, ToolId } from './tool.types';
import { ToolValidationService } from './tool-validation.service';

@Injectable()
export class ToolRegistryService implements OnModuleInit {
  private readonly tools = new Map<ToolId, ToolContract>();

  constructor(private readonly validator: ToolValidationService) {}

  onModuleInit() {
    for (const contract of TOOL_CONTRACTS) {
      this.register(contract);
    }
  }

  register(contract: ToolContract): ToolContract {
    const errors = this.validator.validateContract(contract);
    if (errors.length) {
      throw new Error(`Invalid tool contract ${contract.id}: ${errors.join('; ')}`);
    }
    if (this.tools.has(contract.id)) {
      throw new Error(`Tool already registered: ${contract.id}`);
    }
    this.tools.set(contract.id, { ...contract });
    return contract;
  }

  discover(options: { includeDisabled?: boolean } = {}): ToolContract[] {
    return [...this.tools.values()]
      .filter((tool) => options.includeDisabled || tool.enabled)
      .map((tool) => ({ ...tool }));
  }

  get(toolId: string): ToolContract | undefined {
    return this.tools.get(toolId as ToolId);
  }

  enable(toolId: string): ToolContract {
    return this.setEnabled(toolId, true);
  }

  disable(toolId: string): ToolContract {
    return this.setEnabled(toolId, false);
  }

  validate(toolId: string): string[] {
    const tool = this.get(toolId);
    return tool ? this.validator.validateContract(tool) : [`unknown tool: ${toolId}`];
  }

  private setEnabled(toolId: string, enabled: boolean): ToolContract {
    const tool = this.get(toolId);
    if (!tool) throw new Error(`unknown tool: ${toolId}`);
    tool.enabled = enabled;
    return { ...tool };
  }
}