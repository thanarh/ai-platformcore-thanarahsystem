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
      tenantConfig = {
        ...(tenant.aiConfig || {}),
        industry: tenant.industry || tenant.type || 'general',
        medicalMode: tenant.medicalMode || {},
      };
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
      content: m.feedback?.correction
        ? `${m.content}\n\n[ملاحظة تصحيحية من المستخدم: ${m.feedback.correction}]`
        : m.content,
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
        model: 'thanarah-intelligence',
        backend: 'thanarah-intelligence',
        routeDecision: 'Thanarah intelligent routing',
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

    // Parallel: verify conversation + load tenant config simultaneously
    const [conversation, tenantResult] = await Promise.all([
      this.conversationsService.findById(data.conversationId, data.userId),
      this.tenantsService.findById(data.tenantId).catch(() => null),
    ]);
    const tenantConfig: any = {
      ...(tenantResult?.aiConfig || {}),
      industry: tenantResult?.industry || tenantResult?.type || 'general',
      medicalMode: tenantResult?.medicalMode || {},
    };

    // Parallel: save user message + fetch recent history simultaneously
    const [userMessage, recentMessages] = await Promise.all([
      this.messagesService.create({
        tenantId: data.tenantId,
        userId: data.userId,
        conversationId: data.conversationId,
        role: 'user',
        content: data.content,
      }),
      this.messagesService.getRecentMessages(data.conversationId, 8),
    ]);

    // Auto-title non-blocking (don't await — fire and forget)
    if (conversation.messageCount === 0) {
      this.conversationsService.autoTitle(data.conversationId, data.content).catch(() => {});
    }

    // Include current user message at end of history
    const messages = [
      ...recentMessages.map((m) => ({
        role: m.role,
        content: m.feedback?.correction
          ? `${m.content}\n\n[ملاحظة تصحيحية من المستخدم: ${m.feedback.correction}]`
          : m.content,
      })),
      { role: 'user', content: data.content },
    ];

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
    let sseBuffer = '';
    let doneSent = false;
    let responseEnded = false;
    const continuityContent = 'خدمة ثنارة الذكية قيد الاستعادة حالياً. تم حفظ رسالتك ويمكنك متابعة استخدام المحادثة وقاعدة المعرفة.';

    const persistAssistant = async (content: string, metadata: any = {}) => {
      if (!content) return null;
      const latencyMs = Date.now() - startTime;
      const message = await this.messagesService.create({
        tenantId: data.tenantId,
        userId: data.userId,
        conversationId: data.conversationId,
        role: 'assistant',
        content,
        aiMetadata: { ...metadata, requestId, latency: latencyMs },
      });
      await this.conversationsService.incrementMessageCount(data.conversationId);
      return message;
    };

    const finishWithContinuity = async () => {
      if (responseEnded) return;
      responseEnded = true;
      if (!fullContent) {
        fullContent = continuityContent;
        data.res.write(`data: ${JSON.stringify({ delta: continuityContent })}\n\n`);
      }
      const message = await persistAssistant(
        fullContent,
        Object.keys(aiMeta).length ? aiMeta : { backend: 'thanarah-core' },
      ).catch(() => null);
      data.res.write(`data: ${JSON.stringify({ meta: { service: 'Thanarah Intelligence', userMessageId: userMessage._id, messageId: message?._id } })}\n\n`);
      data.res.write('data: [DONE]\n\n');
      doneSent = true;
      data.res.end();
    };

    try {
      const response = await axios.post(
        `${this.aiEngineUrl}/chat/stream`,
        aiRequest,
        {
          responseType: 'stream',
          timeout: 300000,
        },
      );

      data.res.flushHeaders?.();
      data.res.once('close', () => {
        if (responseEnded) return;
        responseEnded = true;
        response.data.destroy();
        if (fullContent) {
          void persistAssistant(fullContent, { ...aiMeta, stoppedByUser: true }).catch(() => {});
        }
        void this.usageService.record({
          tenantId: data.tenantId,
          userId: data.userId,
          conversationId: data.conversationId,
          requestId,
          backend: aiMeta.backend || 'thanarah-core',
          model: aiMeta.model,
          latencyMs: Date.now() - startTime,
          status: 'cancelled',
        }).catch(() => {});
      });

      response.data.on('data', (chunk: Buffer) => {
        sseBuffer += chunk.toString('utf8');
        const events = sseBuffer.split(/\r?\n\r?\n/);
        sseBuffer = events.pop() || '';

        for (const event of events) {
          for (const line of event.split(/\r?\n/)) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            if (raw === '[DONE]') {
              // Persist first, then emit our own final metadata and DONE event.
              continue;
            }
            try {
              const parsed = JSON.parse(raw);
              if (parsed.delta) fullContent += parsed.delta;
              if (parsed.meta) aiMeta = parsed.meta;
              const publicEvent = parsed.meta
                ? { ...parsed, meta: { service: 'Thanarah Intelligence' } }
                : parsed;
              data.res.write(`data: ${JSON.stringify(publicEvent)}\n\n`);
            } catch (error) {
              this.logger.warn(`Ignored malformed AI stream event: ${error.message}`);
            }
          }
        }
      });

      response.data.on('end', async () => {
        if (responseEnded) return;
        responseEnded = true;
        const latencyMs = Date.now() - startTime;

        if (!fullContent) {
          fullContent = continuityContent;
          data.res.write(`data: ${JSON.stringify({ delta: continuityContent })}\n\n`);
        }

        const savedMessage = await persistAssistant(fullContent, aiMeta).catch((error) => {
          this.logger.warn(`Assistant message persistence failed: ${error.message}`);
          return null;
        });
        await this.usageService.record({
          tenantId: data.tenantId,
          userId: data.userId,
          conversationId: data.conversationId,
          requestId,
          backend: aiMeta.backend || 'thanarah-core',
          model: aiMeta.model,
          latencyMs,
          status: 'success',
        }).catch(() => {});

        data.res.write(`data: ${JSON.stringify({ meta: { service: 'Thanarah Intelligence', userMessageId: userMessage._id, messageId: savedMessage?._id } })}\n\n`);
        if (!doneSent) {
          data.res.write('data: [DONE]\n\n');
          doneSent = true;
        }
        data.res.end();
      });

      response.data.on('error', async (error: Error) => {
        this.logger.error(`AI stream disconnected: ${error.message}`);
        await finishWithContinuity();
      });
    } catch (error) {
      this.logger.error(`Stream failed: ${error.message}`);
      await finishWithContinuity();
    }
  }

  async getAiHealth() {
    try {
      const response = await axios.get(`${this.aiEngineUrl}/health`, { timeout: 5000 });
      const backends = Array.isArray(response.data?.backends) ? response.data.backends : [];
      const advanced = backends.some(
        (backend: any) => backend?.id !== 'fallback' && backend?.enabled && backend?.healthy,
      );
      return {
        status: response.data?.status === 'ok' ? 'ok' : 'degraded',
        service: 'Thanarah Intelligence',
        generation: { advanced },
      };
    } catch {
      return {
        status: 'unavailable',
        service: 'Thanarah Intelligence',
        generation: { advanced: false },
      };
    }
  }

  async getCapabilities() {
    try {
      const response = await axios.get(`${this.aiEngineUrl}/backends/capabilities`, { timeout: 5000 });
      return response.data;
    } catch {
      return { generation: { enabled: false }, embeddings: { ready: false }, rag: { enabled: false } };
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
