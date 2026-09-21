import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { UsageService } from '../usage/usage.service';
import { TenantsService } from '../tenants/tenants.service';
import { ContextProfileService } from '../context-profile/context-profile.service';

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
    private contextProfileService: ContextProfileService,
  ) {
    this.aiEngineUrl = this.configService.get<string>('aiEngine.url');
  }

  async chat(data: {
    conversationId: string;
    content: string;
    userId: string;
    tenantId: string;
    stream?: boolean;
    inputMode?: 'text' | 'voice';
    voiceMetadata?: Record<string, unknown>;
    skillId?: string;
  }) {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Verify conversation belongs to user
    const conversation = await this.conversationsService.findById(
      data.conversationId,
      data.userId,
      data.tenantId,
    );

    // Get tenant config for AI settings
    let tenantConfig: any = {};
    try {
      const tenant = await this.tenantsService.findById(data.tenantId);
      const contextProfile = await this.contextProfileService
        .getForAi(data.tenantId, data.userId)
        .catch(() => ({}));
      tenantConfig = {
        ...(tenant.aiConfig || {}),
        industry: tenant.industry || tenant.type || 'general',
        medicalMode: tenant.medicalMode || {},
        contextProfile,
        runtimeContext: this.buildRuntimeContext(data, tenant, contextProfile),
      };
    } catch {}

    // Save user message
    const userMessage = await this.messagesService.create({
      tenantId: data.tenantId,
      userId: data.userId,
      conversationId: data.conversationId,
      role: 'user',
      content: data.content,
      inputMode: data.inputMode,
      voiceMetadata: data.voiceMetadata,
    });
    void this.contextProfileService.recordInteraction(
      data.tenantId,
      data.userId,
      data.content,
    ).catch(() => {});

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
      inputMode: data.inputMode,
      voiceMetadata: data.voiceMetadata,
      skillId: data.skillId,
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
    inputMode?: 'text' | 'voice';
    voiceMetadata?: Record<string, unknown>;
    skillId?: string;
  }) {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Parallel: verify conversation + load tenant config simultaneously
    const [conversation, tenantResult, contextProfile] = await Promise.all([
      this.conversationsService.findById(data.conversationId, data.userId, data.tenantId),
      this.tenantsService.findById(data.tenantId).catch(() => null),
      this.contextProfileService.getForAi(data.tenantId, data.userId).catch(() => ({})),
    ]);
    const tenantConfig: any = {
      ...(tenantResult?.aiConfig || {}),
      industry: tenantResult?.industry || tenantResult?.type || 'general',
      medicalMode: tenantResult?.medicalMode || {},
      contextProfile,
      runtimeContext: this.buildRuntimeContext(data, tenantResult, contextProfile),
    };

    // Parallel: save user message + fetch recent history simultaneously
    const [userMessage, recentMessages] = await Promise.all([
      this.messagesService.create({
        tenantId: data.tenantId,
        userId: data.userId,
        conversationId: data.conversationId,
        role: 'user',
        content: data.content,
        inputMode: data.inputMode,
        voiceMetadata: data.voiceMetadata,
      }),
      this.messagesService.getRecentMessages(data.conversationId, 8),
    ]);
    void this.contextProfileService.recordInteraction(
      data.tenantId,
      data.userId,
      data.content,
    ).catch(() => {});

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
      inputMode: data.inputMode,
      voiceMetadata: data.voiceMetadata,
      skillId: data.skillId,
    };

    // Set SSE headers
    data.res.setHeader('Content-Type', 'text/event-stream');
    data.res.setHeader('Cache-Control', 'no-cache, no-transform');
    data.res.setHeader('Connection', 'keep-alive');
    data.res.setHeader('Access-Control-Allow-Origin', '*');
    data.res.setHeader('X-Accel-Buffering', 'no');
    data.res.flushHeaders?.();
    data.res.write(': connected\n\n');
      data.res.flush?.();

    let fullContent = '';
    let aiMeta: any = {};
    const conversationTitle = conversation.messageCount === 0
      ? this.conversationsService.createTitle(data.content)
      : undefined;
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
       data.res.write(`data: ${JSON.stringify({ meta: { service: 'Thanarah Intelligence', userMessageId: userMessage._id, messageId: message?._id, conversationTitle } })}\n\n`);
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

      data.res.once('close', () => {
        if (responseEnded) return;
        responseEnded = true;
        response.data.destroy();
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
        if (responseEnded) return;
        sseBuffer += chunk.toString('utf8');
        const events = sseBuffer.split(/\r?\n\r?\n/);
        sseBuffer = events.pop() || '';

        for (const event of events) {
          let eventType = 'message';
          for (const line of event.split(/\r?\n/)) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
              continue;
            }
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
              const publicEvent = eventType !== 'message' && !parsed.event
                ? { ...parsed, event: eventType }
                : parsed.meta
                ? {
                    ...parsed,
                    meta: {
                      ...parsed.meta,
                      service: 'Thanarah Intelligence',
                    },
                  }
                : parsed;
              data.res.write(`data: ${JSON.stringify(publicEvent)}\n\n`);
              data.res.flush?.();
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

        data.res.write(`data: ${JSON.stringify({ meta: { service: 'Thanarah Intelligence', userMessageId: userMessage._id, messageId: savedMessage?._id, conversationTitle } })}\n\n`);
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
        uptimeSeconds: response.data?.uptimeSeconds ?? null,
        ollama: response.data?.ollama ?? { status: 'unknown', available: false },
        mongodb: response.data?.mongodb ?? { status: 'unknown', connected: false },
        cache: response.data?.cache ?? { enabled: false, mode: 'exact' },
        telemetry: response.data?.telemetry ?? { bufferedRecords: 0 },
      };
    } catch {
      return {
        status: 'unavailable',
        service: 'Thanarah Intelligence',
        generation: { advanced: false },
      };
    }
  }

  private buildRuntimeContext(data: { userId: string; tenantId: string }, tenant: any, profile: any) {
    const language =
      profile?.userContext?.preferredLanguage ||
      tenant?.settings?.defaultLanguage ||
      'ar';
    return {
      userId: data.userId,
      tenantId: data.tenantId,
      timezone: tenant?.settings?.timezone || 'UTC',
      locale: language === 'en' ? 'en-US' : 'ar-SA',
      language,
    };
  }

  async getCapabilities() {
    try {
      const response = await axios.get(`${this.aiEngineUrl}/backends/capabilities`, { timeout: 5000 });
      return response.data;
    } catch {
      return { generation: { enabled: false }, embeddings: { ready: false }, rag: { enabled: false } };
    }
  }

  async getSkills() {
    try {
      const response = await axios.get(`${this.aiEngineUrl}/capabilities/skills`, { timeout: 5000 });
      return response.data;
    } catch {
      return { skills: [], executionMode: 'unavailable' };
    }
  }

  async transcribeVoice(data: {
    conversationId: string;
    userId: string;
    tenantId: string;
    audio: Buffer;
    mimeType: string;
    fileName: string;
    language: string;
  }) {
    await this.conversationsService.findById(
      data.conversationId,
      data.userId,
      data.tenantId,
    );
    const form = new FormData();
    form.append(
      'audio',
      new Blob([new Uint8Array(data.audio)], { type: data.mimeType }),
      data.fileName,
    );
    form.append('language', data.language);
    const response = await fetch(`${this.aiEngineUrl}/voice/transcribe`, {
      method: 'POST',
      body: form,
      headers: {
        'x-thanarah-tenant-id': data.tenantId,
        'x-thanarah-user-id': data.userId,
        'x-thanarah-internal': this.configService.get<string>('jwt.secret') || '',
      },
      signal: AbortSignal.timeout(70000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new HttpException(
        detail || 'Voice transcription failed',
        response.status,
      );
    }
    return response.json();
  }

  async synthesizeVoice(data: {
    conversationId: string;
    userId: string;
    tenantId: string;
    text: string;
    language: string;
  }) {
    await this.conversationsService.findById(
      data.conversationId,
      data.userId,
      data.tenantId,
    );
    const response = await fetch(`${this.aiEngineUrl}/voice/synthesize`, {
      method: 'POST',
      body: JSON.stringify({ text: data.text, language: data.language }),
      headers: {
        'Content-Type': 'application/json',
        'x-thanarah-tenant-id': data.tenantId,
        'x-thanarah-user-id': data.userId,
        'x-thanarah-internal': this.configService.get<string>('jwt.secret') || '',
      },
      signal: AbortSignal.timeout(70000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new HttpException(
        detail || 'Voice synthesis failed',
        response.status,
      );
    }
    return {
      content: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'audio/wav',
      provider: response.headers.get('x-thanarah-voice-provider') || 'local',
      latencyMs: response.headers.get('x-thanarah-voice-latency-ms') || '',
    };
  }

  async getVoiceCapabilities() {
    try {
      const response = await axios.get(`${this.aiEngineUrl}/voice/capabilities`, { timeout: 5000 });
      return response.data;
    } catch {
      return {
        voiceEnabled: false,
        executionMode: 'unavailable',
        supportedLanguages: ['ar', 'en'],
        states: ['IDLE', 'LISTENING', 'TRANSCRIBING', 'THINKING', 'GENERATING', 'SPEAKING', 'STOPPED', 'ERROR'],
        speechToText: { available: false },
        textToSpeech: { available: false },
      };
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
