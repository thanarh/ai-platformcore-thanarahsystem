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
import { NotificationsService } from '../notifications/notifications.service';

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
    private notificationsService: NotificationsService,
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
    fastMode?: boolean;
  }) {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Fetch independent account and context data together to reduce the
    // pre-response round trips, especially for WhatsApp's fast mode.
    const [conversation, tenant, contextProfile] = await Promise.all([
      this.conversationsService.findById(
        data.conversationId,
        data.userId,
        data.tenantId,
      ),
      this.tenantsService.findById(data.tenantId).catch(() => null),
      this.contextProfileService.getForAi(data.tenantId, data.userId).catch(() => ({})),
    ]);
    const effectiveTenant = tenant || {};
    const tenantConfig: any = {
      ...(effectiveTenant.aiConfig || {}),
      ...(data.fastMode ? {
        responseProfile: 'fast',
        webSearchEnabled: false,
        openaiWebSearchEnabled: false,
        historyWindow: 4,
        maxHistoryChars: 3000,
      } : {}),
      industry: effectiveTenant.industry || effectiveTenant.type || 'general',
      medicalMode: effectiveTenant.medicalMode || {},
      contextProfile,
      runtimeContext: this.buildRuntimeContext(data, effectiveTenant, contextProfile),
    };

    // Save user message
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

    // Auto-title conversation after first message
    if (conversation.messageCount === 0) {
      void this.conversationsService.autoTitle(data.conversationId, data.content).catch(() => {});
    }

    // A legacy/current-key mismatch should not prevent the new message from
    // reaching the model. Undecryptable historical WhatsApp rows are filtered
    // by MessagesService; append this request exactly once either way.
    const currentMessageId = userMessage?._id?.toString();
    const messages = [
      ...recentMessages
        .filter((message) => !currentMessageId || message._id?.toString() !== currentMessageId)
        .map((message) => ({
          role: message.role,
          content: message.feedback?.correction
            ? `${message.content}\n\n[ملاحظة تصحيحية من المستخدم: ${message.feedback.correction}]`
            : message.content,
        })),
      { role: 'user', content: data.content },
    ];

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
          // WhatsApp uses fastMode but may still need a cold local model load.
          // Allow that single warm-up to finish instead of returning the
          // generic AI error before the local model can answer.
          timeout: data.fastMode ? 45_000 : 120000,
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

      // Message persistence, counts, and telemetry do not depend on each
      // other, so write them concurrently before returning the WhatsApp reply.
      await Promise.all([
        this.conversationsService.incrementMessageCount(
          data.conversationId,
          (aiResponse.inputTokens || 0) + (aiResponse.outputTokens || 0),
        ),
        this.usageService.record({
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
        }).catch((err) => this.logger.warn('Usage record failed:', err.message)),
      ]);
      void this.notificationsService.fireNotify({
        tenantId: data.tenantId,
        userId: data.userId,
        kind: 'chat.completed',
        title: 'اكتمل الرد',
        body: 'اكتمل تنفيذ طلبك في ثنارة.',
        data: {
          conversationId: data.conversationId,
          messageId: assistantMessage._id.toString(),
          requestId,
        },
      }).catch((error) => this.logger.warn(`Completion notification failed: ${error.message}`));

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
      if (!data.fastMode) {
        await this.messagesService.create({
          tenantId: data.tenantId,
          userId: data.userId,
          conversationId: data.conversationId,
          role: 'assistant',
          content: errorContent,
          aiMetadata: { requestId, latency: latencyMs },
        });
      }

      return {
        content: errorContent,
        error: true,
        requestId,
      };
    }
  }

  /**
   * Lightweight, stateless generation for the public Thanarah WhatsApp assistant.
   * It deliberately disables tenant RAG, memory, and web search so platform
   * inquiries do not touch customer data and can use the fast response profile.
   */
  async chatStateless(data: {
    conversationId: string;
    userId: string;
    tenantId: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    systemPrompt: string;
  }) {
    const requestId = uuidv4();
    const response = await axios.post(
      `${this.aiEngineUrl}/chat`,
      {
        requestId,
        conversationId: data.conversationId,
        tenantId: data.tenantId,
        userId: data.userId,
        messages: data.messages,
        tenantConfig: {
          systemPrompt: data.systemPrompt,
          industry: 'technology',
          responseProfile: 'fast',
          ragEnabled: false,
          memoryEnabled: false,
          webSearchEnabled: false,
          openaiWebSearchEnabled: false,
          cacheEnabled: true,
          historyWindow: 4,
          maxHistoryChars: 3000,
        },
        runtimeContext: { language: 'ar', channel: 'whatsapp' },
        inputMode: 'text',
        stream: false,
      },
      {
        timeout: 12_000,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    return {
      content: typeof response.data?.content === 'string' ? response.data.content : '',
      requestId,
    };
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
    const currentMessageId = userMessage?._id?.toString();
    const messages = [
      ...recentMessages
        .filter((m) => !currentMessageId || m._id?.toString() !== currentMessageId)
        .map((m) => ({
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

    let clientDisconnected = data.res.destroyed === true || data.res.writableEnded === true;
    const writeToClient = (chunk: string) => {
      if (clientDisconnected || data.res.destroyed || data.res.writableEnded) return;
      data.res.write(chunk);
      data.res.flush?.();
    };
    // Keep the model stream alive if the browser closes its SSE connection.
    // The completed answer is still persisted and can be delivered by push.
    data.res.once('close', () => {
      clientDisconnected = true;
    });

    // Set SSE headers
    if (!clientDisconnected) {
      data.res.setHeader('Content-Type', 'text/event-stream');
      data.res.setHeader('Cache-Control', 'no-cache, no-transform');
      data.res.setHeader('Connection', 'keep-alive');
      data.res.setHeader('Access-Control-Allow-Origin', '*');
      data.res.setHeader('X-Accel-Buffering', 'no');
      data.res.flushHeaders?.();
      writeToClient(': connected\n\n');
    }

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

    const notifyCompletion = (message: any) => {
      if (!message) return;
      void this.notificationsService.fireNotify({
        tenantId: data.tenantId,
        userId: data.userId,
        kind: 'chat.completed',
        title: 'اكتمل الرد',
        body: 'اكتمل تنفيذ طلبك في ثنارة.',
        data: {
          conversationId: data.conversationId,
          messageId: message._id?.toString(),
          requestId,
        },
      }).catch((error) => this.logger.warn(`Completion notification failed: ${error.message}`));
    };

    const finishWithContinuity = async () => {
      if (responseEnded) return;
      responseEnded = true;
      if (!fullContent) {
        fullContent = continuityContent;
        writeToClient(`data: ${JSON.stringify({ delta: continuityContent })}\n\n`);
      }
      const message = await persistAssistant(
        fullContent,
        Object.keys(aiMeta).length ? aiMeta : { backend: 'thanarah-core' },
      ).catch(() => null);
      notifyCompletion(message);
      writeToClient(`data: ${JSON.stringify({ meta: { service: 'Thanarah Intelligence', userMessageId: userMessage._id, messageId: message?._id, conversationTitle } })}\n\n`);
      writeToClient('data: [DONE]\n\n');
      doneSent = true;
      if (!clientDisconnected && !data.res.destroyed && !data.res.writableEnded) data.res.end();
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
              writeToClient(`data: ${JSON.stringify(publicEvent)}\n\n`);
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
          writeToClient(`data: ${JSON.stringify({ delta: continuityContent })}\n\n`);
        }

        const savedMessage = await persistAssistant(fullContent, aiMeta).catch((error) => {
          this.logger.warn(`Assistant message persistence failed: ${error.message}`);
          return null;
        });
        notifyCompletion(savedMessage);
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

        writeToClient(`data: ${JSON.stringify({ meta: { service: 'Thanarah Intelligence', userMessageId: userMessage._id, messageId: savedMessage?._id, conversationTitle } })}\n\n`);
        if (!doneSent) {
          writeToClient('data: [DONE]\n\n');
          doneSent = true;
        }
        if (!clientDisconnected && !data.res.destroyed && !data.res.writableEnded) data.res.end();
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
