import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { AiGatewayService } from './ai-gateway.service';

@Controller('ai/v1/tools')
@UseGuards(JwtAuthGuard)
export class AiGatewayController {
  constructor(
    private readonly gateway: AiGatewayService,
  ) {}

  @Get()
  discover(@CurrentUser() user: any) {
    return this.gateway.discover(user);
  }

  @Get('capabilities')
  capabilities(@CurrentUser() user: any) {
    return this.gateway.capabilities(user);
  }

  @Post('route')
  @HttpCode(200)
  route(@CurrentUser() user: any, @Body('query') query: string) {
    return this.gateway.route(user, query);
  }

  @Post('execute')
  @HttpCode(200)
  async execute(@CurrentUser() user: any, @Body() body: ExecuteToolDto) {
    return this.gateway.execute(user, body);
  }

  @Post('execute/stream')
  async executeStream(
    @CurrentUser() user: any,
    @Body() body: ExecuteToolDto,
    @Res() response: Response,
  ) {
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
    const result = await this.gateway.execute(user, body, (event) => write(event.event, event));
    write(result.success ? 'done' : 'error', result);
    response.write('data: [DONE]\n\n');
    response.end();
  }
}