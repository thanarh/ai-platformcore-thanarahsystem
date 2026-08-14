import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { UsageService } from '../usage/usage.service';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiEngineUrl: string;

  constructor(
    private configService: ConfigService,
    private conversationsService: ConversationsService,
    private messagesService: MessagesService,
    private usageService: UsageService,
    private tenantsService: TenantsService,
  ) {
    this.aiEngineUrl = this.configService.get<string>('aiEngine.url');
  }

  async chat(data: {
    conversationId: string;
    content: string;
    userId: string;
    tenantId: string;
    stream?: boolean;
  }) {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Verify conversation belongs to user
    const conversation = await this.conversationsService.findById(
      data.conversationId,
      data.userId,
    );

    // Get tenant config for AI settings
    let tenantConfig: any = {};
    try {
      const tenant = await this.tenantsService.findById(data.tenantId);
      tenantConfig = tenant.aiConfig || {};
    } catch {}

    // Save user message
    const userMessage = await this.messagesService.create({
      tenantId: data.tenantId,
      userId: data.userId,
      conversationId: data.conversationId,
      role: 'user',
      content: data.content,
    });

    // Auto-title conversation after first message
    if (conversation.messageCount === 0) {
      await this.conversationsService.autoTitle(data.conversationId, data.content);
    }

    // Get recent messages for context (8 messages = 4 turns, keeps prompt short)
    const recentMessages = await this.messagesService.getRecentMessages(
      data.conversationId,
      8,
    );

    const messages = recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Build AI request payload
    const aiRequest = {
      requestId,
      conversationId: data.conversationId,
      tenantId: data.tenantId,
      userId: data.userId,
      messages,
      tenantConfig,
      conversationSummary: conversation.summary,
      stream: data.stream || false,
    };

    try {
      // Forward to Python AI engine
      const response = await axios.post(
        `${this.aiEngineUrl}/chat`,
        aiRequest,
        {
          timeout: 120000,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const aiResponse = response.data;
      const latencyMs = Date.now() - startTime;

      // Save assistant message
      const assistantMessage = await this.messagesService.create({
        tenantId: data.tenantId,
        userId: data.userId,
        conversationId: data.conversationId,
        role: 'assistant',
        content: aiResponse.content,
        aiMetadata: {
          model: aiResponse.model,
          backend: aiResponse.backend,
          routeDecision: aiResponse.routeDecision,
          inputTokens: aiResponse.inputTokens || 0,
          outputTokens: aiResponse.outputTokens || 0,
          latency: latencyMs,
          requestId,
          toolCalls: aiResponse.toolCalls || [],
          ragSources: aiResponse.ragSources || [],
        },
      });

      // Update conversation stats
      await this.conversationsService.incrementMessageCount(
        data.conversationId,
        (aiResponse.inputTokens || 0) + (aiResponse.outputTokens || 0),
      );

      // Record usage telemetry
      await this.usageService.record({
        tenantId: data.tenantId,
        userId: data.userId,
        conversationId: data.conversationId,
        requestId,
        backend: aiResponse.backend,
        model: aiResponse.model,
        routeDecision: aiResponse.routeDecision,
        inputTokens: aiResponse.inputTokens || 0,
        outputTokens: aiResponse.outputTokens || 0,
        latencyMs,
        status: 'success',
        ragUsed: (aiResponse.ragSources || []).length > 0,
      }).catch((err) => this.logger.warn('Usage record failed:', err.message));

      return {
        messageId: assistantMessage._id,
        content: aiResponse.content,
        model: aiResponse.model,
        backend: aiResponse.backend,
        routeDecision: aiResponse.routeDecision,
        ragSources: aiResponse.ragSources || [],
        toolCalls: aiResponse.toolCalls || [],
        requestId,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // Record failed usage
      await this.usageService.record({
        tenantId: data.tenantId,
        userId: data.userId,
        conversationId: data.conversationId,
        requestId,
        status: 'error',
        error: error.message,
        latencyMs,
      }).catch(() => {});

      this.logger.error(`AI request failed: ${error.message}`);

      // Return graceful error message in Arabic
      const errorContent = 'تعذر إكمال الطلب حاليًا. حاول مرة أخرى.';
      await this.messagesService.create({
        tenantId: data.tenantId,
        userId: data.userId,
        conversationId: data.conversationId,
        role: 'assistant',
        content: errorContent,
        aiMetadata: { requestId, latency: latencyMs },
      });

      return {
        content: errorContent,
        error: true,
        requestId,
      };
    }
  }

  async streamChat(data: {
    conversationId: string;
    content: string;
    userId: string;
    tenantId: string;
    res: any;
  }) {
    const requestId = uuidv4();
    const startTime = Date.now();

    const conversation = await this.conversationsService.findById(
      data.conversationId,
      data.userId,
    );

    let tenantConfig: any = {};
    try {
      const tenant = await this.tenantsService.findById(data.tenantId);
      tenantConfig = tenant.aiConfig || {};
    } catch {}

    // Save user message
    await this.messagesService.create({
      tenantId: data.tenantId,
      userId: data.userId,
      conversationId: data.conversationId,
      role: 'user',
      content: data.content,
    });

    if (conversation.messageCount === 0) {
      await this.conversationsService.autoTitle(data.conversationId, data.content);
    }

    const recentMessages = await this.messagesService.getRecentMessages(data.conversationId, 8);
    const messages = recentMessages.map((m) => ({ role: m.role, content: m.content }));

    const aiRequest = {
      requestId,
      conversationId: data.conversationId,
      tenantId: data.tenantId,
      userId: data.userId,
      messages,
      tenantConfig,
      conversationSummary: conversation.summary,
      stream: true,
    };

    // Set SSE headers
    data.res.setHeader('Content-Type', 'text/event-stream');
    data.res.setHeader('Cache-Control', 'no-cache');
    data.res.setHeader('Connection', 'keep-alive');
    data.res.setHeader('Access-Control-Allow-Origin', '*');

    let fullContent = '';
    let aiMeta: any = {};

    try {
      const response = await axios.post(
        `${this.aiEngineUrl}/chat/stream`,
        aiRequest,
        {
          responseType: 'stream',
          timeout: 120000,
        },
      );

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') {
              data.res.write('data: [DONE]\n\n');
              return;
            }
            try {
              const parsed = JSON.parse(raw);
              if (parsed.delta) fullContent += parsed.delta;
              if (parsed.meta) aiMeta = parsed.meta;
              data.res.write(`data: ${raw}\n\n`);
            } catch {}
          }
        }
      });

      response.data.on('end', async () => {
        const latencyMs = Date.now() - startTime;

        // Save complete assistant message
        if (fullContent) {
          await this.messagesService.create({
            tenantId: data.tenantId,
            userId: data.userId,
            conversationId: data.conversationId,
            role: 'assistant',
            content: fullContent,
            aiMetadata: { ...aiMeta, requestId, latency: latencyMs },
          });

          await this.conversationsService.incrementMessageCount(data.conversationId);
          await this.usageService.record({
            tenantId: data.tenantId,
            userId: data.userId,
            conversationId: data.conversationId,
            requestId,
            backend: aiMeta.backend,
            model: aiMeta.model,
            latencyMs,
            status: 'success',
          }).catch(() => {});
        }

        data.res.end();
      });

      response.data.on('error', () => {
        data.res.write('data: {"error": true, "content": "تعذر إكمال الطلب حاليًا."}\n\n');
        data.res.end();
      });
    } catch (error) {
      this.logger.error(`Stream failed: ${error.message}`);
      data.res.write('data: {"error": true, "content": "تعذر إكمال الطلب حاليًا."}\n\n');
      data.res.end();
    }
  }

  async getAiHealth() {
    try {
      const response = await axios.get(`${this.aiEngineUrl}/health`, { timeout: 5000 });
      return response.data;
    } catch {
      return { status: 'unavailable', backends: [] };
    }
  }

  async getBackends() {
    try {
      const response = await axios.get(`${this.aiEngineUrl}/backends`, { timeout: 5000 });
      return response.data;
    } catch {
      return { backends: [] };
    }
  }

  async updateBackend(backendId: string, data: any) {
    try {
      const response = await axios.put(
        `${this.aiEngineUrl}/backends/${backendId}`,
        data,
        { timeout: 5000 },
      );
      return response.data;
    } catch (err) {
      throw new HttpException('AI Engine unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async testBackend(backendId: string) {
    try {
      const response = await axios.post(
        `${this.aiEngineUrl}/backends/${backendId}/test`,
        {},
        { timeout: 15000 },
      );
      return response.data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}
