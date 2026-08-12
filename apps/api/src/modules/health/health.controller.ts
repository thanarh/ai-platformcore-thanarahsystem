import { Controller, Get, SetMetadata } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

const IS_PUBLIC_KEY = 'isPublic';
const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Public()
  async getHealth() {
    return {
      status: 'ok',
      service: 'Thanarah AI API',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('database')
  @Public()
  async getDatabaseHealth() {
    const isConnected = this.connection.readyState === 1;
    return {
      status: isConnected ? 'ok' : 'error',
      database: 'MongoDB',
      connected: isConnected,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ai')
  @Public()
  async getAiHealth() {
    const aiUrl = this.configService.get('aiEngine.url');
    try {
      const res = await axios.get(`${aiUrl}/health`, { timeout: 5000 });
      return { status: 'ok', aiEngine: res.data, timestamp: new Date().toISOString() };
    } catch {
      return { status: 'error', aiEngine: 'unavailable', timestamp: new Date().toISOString() };
    }
  }

  @Get('full')
  @Public()
  async getFullHealth() {
    const dbConnected = this.connection.readyState === 1;
    const aiUrl = this.configService.get('aiEngine.url');

    let aiStatus = 'unknown';
    let aiData: any = null;
    try {
      const res = await axios.get(`${aiUrl}/health`, { timeout: 5000 });
      aiStatus = 'ok';
      aiData = res.data;
    } catch {
      aiStatus = 'unavailable';
    }

    const overallOk = dbConnected && aiStatus === 'ok';

    return {
      status: overallOk ? 'ok' : 'degraded',
      components: {
        api: { status: 'ok' },
        database: { status: dbConnected ? 'ok' : 'error', connected: dbConnected },
        aiEngine: { status: aiStatus, data: aiData },
      },
      timestamp: new Date().toISOString(),
    };
  }
}
