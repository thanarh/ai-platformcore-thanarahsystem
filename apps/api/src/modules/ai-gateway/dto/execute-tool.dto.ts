import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class ExecuteToolDto {
  @IsString()
  @IsNotEmpty()
  toolId: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsObject()
  arguments: Record<string, unknown>;
}