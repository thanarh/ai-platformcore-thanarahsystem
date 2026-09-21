import { Injectable } from '@nestjs/common';
import { JsonSchema, ToolContract } from './tool.types';

@Injectable()
export class ToolValidationService {
  validateContract(contract: ToolContract): string[] {
    const errors: string[] = [];
    if (!contract.id || !contract.name || !contract.version) {
      errors.push('tool contract requires id, name, and version');
    }
    if (!contract.tenantScoped || !contract.userScoped || !contract.readOnly) {
      errors.push('Phase 4 tools must be tenant-scoped, user-scoped, and read-only');
    }
    if (!contract.inputSchema || contract.inputSchema.type !== 'object') {
      errors.push('tool inputSchema must be an object schema');
    }
    return errors;
  }

  validateArguments(schema: JsonSchema, value: unknown, path = 'arguments'): string[] {
    const errors: string[] = [];
    if (schema.enum && !schema.enum.includes(value as never)) {
      errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
      return errors;
    }

    if (schema.type === 'object') {
      if (!this.isPlainObject(value)) {
        errors.push(`${path} must be an object`);
        return errors;
      }
      const objectValue = value as Record<string, unknown>;
      for (const field of schema.required || []) {
        if (!(field in objectValue) || objectValue[field] === undefined || objectValue[field] === '') {
          errors.push(`${path}.${field} is required`);
        }
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(objectValue)) {
          if (!schema.properties?.[key]) {
            errors.push(`${path}.${key} is not allowed`);
          }
        }
      }
      for (const [key, childSchema] of Object.entries(schema.properties || {})) {
        if (objectValue[key] !== undefined) {
          errors.push(...this.validateArguments(childSchema, objectValue[key], `${path}.${key}`));
        }
      }
      return errors;
    }

    if (schema.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`${path} must be an array`);
      } else if (schema.items) {
        value.forEach((item, index) => {
          errors.push(...this.validateArguments(schema.items!, item, `${path}[${index}]`));
        });
      }
      return errors;
    }

    const matchesType =
      (schema.type === 'string' && typeof value === 'string') ||
      (schema.type === 'boolean' && typeof value === 'boolean') ||
      (schema.type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
      (schema.type === 'integer' && typeof value === 'number' && Number.isInteger(value));
    if (!matchesType) {
      errors.push(`${path} must be a ${schema.type}`);
      return errors;
    }

    if (typeof value === 'string' && schema.minLength && value.length < schema.minLength) {
      errors.push(`${path} must not be empty`);
    }
    if (schema.format === 'date' && typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push(`${path} must use YYYY-MM-DD`);
    }
    if (schema.format === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
      ) {
        errors.push(`${path} must be a valid calendar date`);
      }
    }
    return errors;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}