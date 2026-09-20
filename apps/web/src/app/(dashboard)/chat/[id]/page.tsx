'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Send, Square, Copy, Menu, ThumbsUp, ThumbsDown, Pin, Sparkles, Mic, Type } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore, Message } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { aiApi, messagesApi } from '@/lib/api';
import { streamChat, cn, isRTL } from '@/lib/utils';
import { ThanarahIcon } from '@/components/ThanarahLogo';

type VoiceState = 'IDLE' | 'LISTENING' | 'TRANSCRIBING' | 'THINKING' | 'GENERATING' | 'SPEAKING' | 'STOPPED' | 'ERROR';

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const convId = params.id as string;

  const { token } = useAuthStore();
  const {
    messages, addMessage, setMessages, updateLastMessage,
    finalizeLastMessage, updateMessage,
    isStreaming, setStreaming, setLoading, isLoading, toggleSidebar,
    updateConversation,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const [skills, setSkills] = useState<any[]>([]);
  const [executionEvents, setExecutionEvents] = useState<any[]>([]);
  const [voiceCapabilities, setVoiceCapabilities] = useState<any>(null);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const convMessages: Message[] = messages[convId] || [];

  useEffect(() => {
    aiApi.skills()
      .then((payload) => setSkills(payload?.skills || []))
      .catch(() => setSkills([]));
    aiApi.voiceCapabilities()
      .then((payload) => setVoiceCapabilities(payload))
      .catch(() => setVoiceCapabilities(null));
  }, []);

  useEffect(() => {
    if (!convId) return;
    setLoading(true);
    messagesApi.list(convId)
      .then((msgs) => {
        setMessages(convId, msgs);
        const savedFeedback: Record<string, 'up' | 'down'> = {};
        msgs.forEach((message: Message) => {
          if (message._id && message.feedback?.rating) savedFeedback[message._id] = message.feedback.rating;
        });
        setFeedback(savedFeedback);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [convId]);

  useEffect(() => {
    const prompt = searchParams?.get('prompt');
    if (prompt && convMessages.length === 0) {
      setInput(prompt);
      setTimeout(() => handleSend(prompt), 100);
    }
  }, [convId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [convMessages]);

  const handleSend = useCallback(async (overrideContent?: string) => {
    const content = (overrideContent || input).trim();
    if (!content || isStreaming || !token) return;

    setInput('');
    setExecutionEvents([]);
    setStreaming(true);
    const controller = new AbortController();
    setAbortController(controller);

    // Add user message
    addMessage(convId, { role: 'user', content, createdAt: new Date().toISOString() });

    // Add an operational placeholder immediately; it is not model reasoning.
    addMessage(convId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
      streamStatus: 'analyzing',
    });

    let accumulated = '';

    await streamChat(
      convId,
      content,
      token,
      (delta) => {
        accumulated += delta;
        updateLastMessage(convId, accumulated, false, 'generating');
      },
      (meta) => {
        finalizeLastMessage(convId, accumulated, meta);
        if (meta?.conversationTitle) {
          updateConversation(convId, { title: meta.conversationTitle });
        }
        setStreaming(false);
        setAbortController(null);
        window.dispatchEvent(new Event('thanarah-usage-changed'));
      },
      (err) => {
        finalizeLastMessage(convId, err || 'تعذر إكمال الطلب حاليًا. حاول مرة أخرى.');
        setStreaming(false);
        setAbortController(null);
        window.dispatchEvent(new Event('thanarah-usage-changed'));
      },
      (event) => {
        setExecutionEvents((current) => [...current, event].slice(-8));
      },
      controller.signal,
      { inputMode: 'text' },
    );
  }, [input, convId, token, isStreaming, addMessage, finalizeLastMessage, setStreaming, updateLastMessage, updateConversation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  };

  const adjustTextarea = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-gray-200 bg-white h-14 flex-shrink-0 safe-area-x">
        <button
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition lg:hidden"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] sm:text-xs text-amber-800 font-arabic whitespace-nowrap" dir="rtl">
          نسخة تجريبية · اكتمال المشروع 100%
        </span>
      </div>

      {skills.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-100 bg-white px-3 py-2 sm:px-4" dir="rtl">
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 font-arabic whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5 text-thanarah-600" />
            Skills
          </span>
          {skills.slice(0, 8).map((skill) => (
            <span
              key={skill.id}
              title={skill.implementationStatus === 'contract-only' ? 'Contract فقط — غير مفعّلة في هذه المرحلة' : skill.description}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[10px] whitespace-nowrap font-arabic',
                skill.enabled
                  ? 'border-thanarah-200 bg-thanarah-50 text-thanarah-800'
                  : 'border-gray-200 bg-gray-50 text-gray-400',
              )}
            >
              {skill.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-gray-100 bg-white px-3 py-2 sm:px-4" dir="rtl">
        <button
          type="button"
          onClick={() => { setInputMode('text'); setVoiceState('IDLE'); }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-arabic transition',
            inputMode === 'text' ? 'bg-thanarah-100 text-thanarah-800' : 'text-gray-500 hover:bg-gray-100',
          )}
          aria-pressed={inputMode === 'text'}
        >
          <Type className="h-3.5 w-3.5" />
          Text
        </button>
        <button
          type="button"
          onClick={() => setInputMode('voice')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-arabic transition',
            inputMode === 'voice' ? 'bg-thanarah-100 text-thanarah-800' : 'text-gray-500 hover:bg-gray-100',
          )}
          aria-pressed={inputMode === 'voice'}
          title={voiceCapabilities?.voiceEnabled ? 'Voice mode' : 'Voice foundation فقط — محرك الصوت غير متاح'}
        >
          <Mic className="h-3.5 w-3.5" />
          Voice
        </button>
        {inputMode === 'voice' && (
          <span className="mr-2 text-[10px] text-gray-400 font-arabic">
            {voiceCapabilities?.voiceEnabled
              ? 'جاهز للاستماع'
              : 'Foundation فقط: STT/TTS غير مثبت'}
          </span>
        )}
      </div>

      {inputMode === 'voice' && (
        <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 sm:px-4" dir="rtl">
          <div className="mx-auto flex max-w-3xl items-center gap-2 text-[11px] text-gray-500 font-arabic">
            <Mic className={cn('h-4 w-4', voiceState === 'LISTENING' ? 'text-red-500' : 'text-gray-400')} />
            <span>
              {voiceState === 'ERROR'
                ? 'Voice غير متاح حاليًا'
                : voiceState === 'LISTENING'
                  ? 'Listening...'
                  : voiceState === 'SPEAKING'
                    ? 'Speaking...'
                    : 'اضغط على الميكروفون عند توفر محرك STT المحلي'}
            </span>
            <span className="mr-auto rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px]">
              {voiceState}
            </span>
          </div>
        </div>
      )}

      {executionEvents.length > 0 && (
        <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 sm:px-4" dir="rtl" aria-live="polite">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            {executionEvents.map((event, index) => (
              <span key={`${event.event}-${index}`} className="inline-flex items-center gap-1 text-[11px] text-gray-500 font-arabic">
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  event.event === 'status' && event.state === 'completed' ? 'bg-green-500' : 'bg-thanarah-500 animate-pulse',
                )} />
                {event.event === 'status'
                  ? event.state === 'completed' ? 'اكتمل التنفيذ' : 'جاري تجهيز الطلب'
                  : event.event === 'task_started' ? 'بدأت مهمة'
                    : event.event === 'task_completed' ? 'اكتملت مهمة'
                      : event.event === 'artifact_created' ? 'تم إنشاء artifact'
                        : event.event}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {isLoading && convMessages.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-thanarah-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {convMessages.map((msg, idx) => (
          <MessageBubble
            key={msg._id || idx}
            message={msg}
            onCopy={() => handleCopy(msg.content)}
            onPin={async () => {
              if (!msg._id) return;
              const pinned = !msg.isPinned;
              try {
                await messagesApi.pin(msg._id, pinned);
                updateMessage(convId, msg._id, { isPinned: pinned });
              } catch {}
            }}
            feedback={msg._id ? feedback[msg._id] : undefined}
            onFeedback={async (rating) => {
              if (!msg._id) return;
              const correction = rating === 'down' && typeof window !== 'undefined'
                ? window.prompt('ما التصحيح أو التحسين المطلوب؟') || undefined
                : undefined;
              try {
                await messagesApi.feedback(msg._id, rating, correction);
                setFeedback((current) => ({ ...current, [msg._id as string]: rating }));
              } catch {}
            }}
          />

        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-200 bg-white flex-shrink-0 safe-area-x">
        <div
          className="flex items-end gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-thanarah-400 focus-within:ring-1 focus-within:ring-thanarah-400 transition"
          dir="rtl"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالتك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)"
            className="flex-1 bg-transparent resize-none outline-none text-base sm:text-sm text-gray-800 placeholder-gray-400 font-arabic leading-relaxed max-h-40"
            rows={1}
            dir={isRTL(input) ? 'rtl' : 'ltr'}
            style={{ minHeight: '24px' }}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            {isStreaming ? (
              <button
                onClick={() => abortController?.abort()}
                className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-lg transition"
                title="إيقاف"
              >
                <Square className="w-3.5 h-3.5 text-gray-600 fill-gray-600" />
              </button>
            ) : (
              <>
                {inputMode === 'voice' && (
                  <button
                    type="button"
                    disabled={!voiceCapabilities?.voiceEnabled}
                    onClick={() => setVoiceState('LISTENING')}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 transition"
                    title={voiceCapabilities?.voiceEnabled ? 'بدء الاستماع' : 'Voice foundation فقط — STT غير متاح'}
                  >
                    <Mic className="w-3.5 h-3.5 text-thanarah-700" />
                  </button>
                )}
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="w-8 h-8 flex items-center justify-center bg-thanarah-700 hover:bg-thanarah-600 disabled:bg-gray-200 rounded-lg transition disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5 text-white disabled:text-gray-400" />
                </button>
              </>
            )}
          </div>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-2 font-arabic">
          ثنارة AI قد يرتكب أخطاء. تحقق من المعلومات المهمة.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message, onCopy, onPin, onFeedback, feedback }: { message: Message; onCopy: () => void; onPin: () => void; onFeedback: (rating: 'up' | 'down') => void; feedback?: 'up' | 'down' }) {
  const isUser = message.role === 'user';
  const isArabic = isRTL(message.content);

  return (
    <div className="flex justify-start animate-message-in">
      <div className={cn('max-w-[92%] sm:max-w-[85%] lg:max-w-[75%]', isUser ? 'mr-auto' : 'ml-auto')}>
        {isUser ? (
          <div className="group">
            <div
              className="bg-thanarah-700 text-white rounded-2xl rounded-tl-md px-4 py-3 text-sm font-arabic leading-relaxed"
              dir={isArabic ? 'rtl' : 'ltr'}
            >
              {message.inputMode === 'voice' && (
                <div className="mb-1 flex items-center gap-1 text-[10px] text-white/70 font-arabic">
                  <Mic className="h-3 w-3" />
                  Voice transcription
                </div>
              )}
              {message.content}
            </div>
            {message._id && (
              <div className="mt-1 flex justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                <button
                  onClick={onPin}
                  className={cn('p-1 transition', message.isPinned ? 'text-thanarah-600' : 'text-gray-400 hover:text-thanarah-600')}
                  title={message.isPinned ? 'إلغاء التثبيت' : 'تثبيت الرسالة'}
                >
                  <Pin className={cn('w-3.5 h-3.5', message.isPinned && 'fill-current')} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            className="group bg-transparent px-1 py-2"
            dir={isArabic ? 'rtl' : 'ltr'}
          >
            {message.isStreaming && !message.content ? (
              <div
                className="flex min-h-10 items-center gap-2 text-xs text-gray-500"
                role="status"
                aria-label="جارٍ تجهيز الرد"
                aria-live="polite"
              >
                <ThanarahIcon
                  size={24}
                  className="animate-thanarah-loading"
                />
                <span>
                  {message.streamStatus === 'analyzing'
                    ? 'Analyzing...'
                    : 'Generating response...'}
                </span>
              </div>
            ) : (
              <>
                {message.isStreaming && (
                  <div
                    className="mb-2 flex items-center gap-2 text-[11px] text-gray-500"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-thanarah-600 animate-pulse-subtle" />
                    <span>Generating response...</span>
                  </div>
                )}
                <div className={cn('prose-chat text-gray-800', isArabic ? 'font-arabic' : '')}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
                {message.isStreaming && (
                  <span className="inline-block w-1 h-4 bg-thanarah-600 animate-pulse-subtle rounded ml-0.5" />
                )}
                {message.streamStatus === 'stopped' && !message.isStreaming && (
                  <div className="mt-2 text-[11px] text-gray-400" role="status">
                    Response stopped
                  </div>
                )}
                {!message.isStreaming && message.content && (
                  <div className="flex items-center justify-end mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    <button
                      onClick={onPin}
                      className={cn('p-1 transition', message.isPinned ? 'text-thanarah-600' : 'text-gray-400 hover:text-thanarah-600')}
                      title={message.isPinned ? 'إلغاء التثبيت' : 'تثبيت الرسالة'}
                    >
                      <Pin className={cn('w-3.5 h-3.5', message.isPinned && 'fill-current')} />
                    </button>
                    <button
                      onClick={() => onFeedback('up')}
                      className={cn('p-1 transition', feedback === 'up' ? 'text-green-600' : 'text-gray-400 hover:text-green-600')}
                      title="رد مفيد"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onFeedback('down')}
                      className={cn('p-1 transition', feedback === 'down' ? 'text-red-600' : 'text-gray-400 hover:text-red-600')}
                      title="يحتاج إلى تحسين"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={onCopy}
                      className="p-1 text-gray-400 hover:text-gray-600 transition"
                      title="نسخ"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
