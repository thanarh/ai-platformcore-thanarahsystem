'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Send, Square, Copy, ExternalLink, Globe2, Menu, ThumbsUp, ThumbsDown, Pin, Sparkles, Mic, Type, Wand2, Paperclip, FileText, X, ListTodo, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore, Message } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { aiApi, filesApi, messagesApi } from '@/lib/api';
import { streamChat, cn, isRTL } from '@/lib/utils';
import { ThanarahIcon } from '@/components/ThanarahLogo';
import TaskAssistantPanel, { AssistantTask } from '@/components/TaskAssistantPanel';

type VoiceState = 'IDLE' | 'LISTENING' | 'TRANSCRIBING' | 'THINKING' | 'GENERATING' | 'SPEAKING' | 'STOPPED' | 'ERROR';
type ChatAttachment = {
  name: string;
  type: string;
  size: number;
  content: string;
  truncated?: boolean;
};

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const convId = params.id as string;

  const { token, user } = useAuthStore();
  const {
    messages, addMessage, setMessages, updateStreamingMessage,
    finalizeMessage, updateMessage,
    setStreaming, setLoading, isLoading, toggleSidebar,
    updateConversation,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const [skills, setSkills] = useState<any[]>([]);
  const [executionEvents, setExecutionEvents] = useState<any[]>([]);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [voiceError, setVoiceError] = useState('');
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<'ar' | 'en'>('ar');
  const [showTools, setShowTools] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | undefined>();
  const [activeRequestCount, setActiveRequestCount] = useState(0);
  const [showTaskAssistant, setShowTaskAssistant] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isExtractingFile, setIsExtractingFile] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamControllersRef = useRef(new Map<string, AbortController>());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

  const convMessages: Message[] = messages[convId] || [];

  useEffect(() => {
    aiApi.voiceCapabilities()
      .then((capabilities) => setVoiceAvailable(capabilities?.voiceEnabled === true))
      .catch(() => setVoiceAvailable(false));
    aiApi.skills()
      .then((payload) => setSkills(payload?.skills || []))
      .catch(() => setSkills([]));
  }, []);

  useEffect(() => () => {
    recorderRef.current?.stop?.();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioRef.current?.pause();
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

  const speakResponse = useCallback(async (content: string, language: 'ar' | 'en') => {
    if (!content) {
      setVoiceState('IDLE');
      return;
    }
    try {
      const audioBlob = await aiApi.voiceSynthesize(convId, content, language);
      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current?.pause();
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setVoiceState('IDLE');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setVoiceState('IDLE');
      };
      setVoiceState('SPEAKING');
      await audio.play();
    } catch {
      // Text delivery already succeeded; TTS is deliberately best-effort.
      setVoiceState('IDLE');
    }
  }, [convId]);

  const handleSend = useCallback(async (
    overrideContent?: string,
    requestOptions?: {
      inputMode?: 'text' | 'voice';
      voiceMetadata?: Record<string, unknown>;
      speakResponse?: boolean;
      language?: 'ar' | 'en';
      skillId?: string;
    },
  ) => {
    const typedContent = (overrideContent || input).trim();
    const attachmentContext = attachments.map((file) => (
      `\n\n[مرفق للتحليل: ${file.name}]\n${file.content}${file.truncated ? '\n[تم اختصار الملف لطوله الكبير]' : ''}`
    )).join('');
    const content = `${typedContent || (attachments.length ? 'حلل الملفات المرفقة واشرح أهم ما ورد فيها.' : '')}${attachmentContext}`.trim();
    if (!content || !token) return;

    setInput('');
    setAttachments([]);
    setAttachmentError('');
    if (streamControllersRef.current.size === 0) setExecutionEvents([]);
    setStreaming(true);
    const controller = new AbortController();
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const assistantClientId = `assistant-${requestId}`;
    streamControllersRef.current.set(requestId, controller);
    setActiveRequestCount((count) => count + 1);
    if (requestOptions?.inputMode === 'voice') setVoiceState('THINKING');

    // Add user message
    addMessage(convId, {
      role: 'user',
      content,
      clientId: `user-${requestId}`,
      inputMode: requestOptions?.inputMode || inputMode,
      voiceMetadata: requestOptions?.voiceMetadata,
      createdAt: new Date().toISOString(),
    });

    // Add an operational placeholder immediately; it is not model reasoning.
    addMessage(convId, {
      role: 'assistant',
      content: '',
      clientId: assistantClientId,
      isStreaming: true,
      streamStatus: 'analyzing',
    });

    let accumulated = '';
    let finished = false;
    const finishRequest = () => {
      if (finished) return;
      finished = true;
      streamControllersRef.current.delete(requestId);
      setActiveRequestCount((count) => Math.max(0, count - 1));
      setStreaming(streamControllersRef.current.size > 0);
      if (requestOptions?.speakResponse && accumulated) {
        speakResponse(accumulated, requestOptions.language || 'ar');
      } else if (requestOptions?.speakResponse) {
        setVoiceState('IDLE');
      }
      window.dispatchEvent(new Event('thanarah-usage-changed'));
    };

    await streamChat(
      convId,
      content,
      token,
      (delta) => {
        accumulated += delta;
        if (requestOptions?.inputMode === 'voice') setVoiceState('GENERATING');
        updateStreamingMessage(convId, assistantClientId, accumulated, false, 'generating');
      },
      (meta) => {
        finalizeMessage(convId, assistantClientId, accumulated, {
          ...(meta || {}),
          userClientId: `user-${requestId}`,
        });
        if (meta?.conversationTitle) {
          updateConversation(convId, { title: meta.conversationTitle });
        }
        finishRequest();
      },
      (err) => {
        const errorContent = err || 'تعذر إكمال الطلب حاليًا. حاول مرة أخرى.';
        finalizeMessage(convId, assistantClientId, errorContent);
        finishRequest();
      },
      (event) => {
        setExecutionEvents((current) => [...current, event].slice(-8));
      },
      controller.signal,
      {
        inputMode: requestOptions?.inputMode || inputMode,
        voiceMetadata: requestOptions?.voiceMetadata,
        skillId: requestOptions?.skillId || selectedSkillId,
      },
    );
  }, [input, attachments, convId, token, inputMode, selectedSkillId, addMessage, finalizeMessage, setStreaming, updateStreamingMessage, updateConversation, speakResponse]);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;
    if (attachments.length + selectedFiles.length > 3) {
      setAttachmentError('يمكنك إرفاق 3 ملفات كحد أقصى في الرسالة الواحدة.');
      return;
    }
    setAttachmentError('');
    setIsExtractingFile(true);
    try {
      const extractedFiles = await Promise.all(selectedFiles.map((file) => filesApi.extract(file)));
      setAttachments((current) => [...current, ...extractedFiles]);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      setAttachmentError(Array.isArray(message) ? message.join('، ') : (message || 'تعذر قراءة الملف. جرّب PDF أو ملفًا نصيًا أصغر.'));
    } finally {
      setIsExtractingFile(false);
    }
  };

  const removeAttachment = (name: string) => {
    setAttachments((current) => current.filter((file) => file.name !== name));
  };

  const askAboutTask = (task: AssistantTask) => {
    setInput(`ساعدني في تنظيم وتنفيذ هذه المهمة: ${task.title}`);
    setShowTaskAssistant(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const startVoiceCapture = useCallback(async () => {
    setInputMode('voice');
    setVoiceError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('المتصفح لا يدعم تسجيل الصوت المحلي.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setVoiceState('LISTENING');
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setVoiceError('تعذر تسجيل الصوت. حاول مرة أخرى.');
        setVoiceState('ERROR');
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        if (chunks.length === 0) {
          setVoiceState('IDLE');
          return;
        }
        setVoiceState('TRANSCRIBING');
        try {
          const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
          const result = await aiApi.voiceTranscribe(convId, audio, voiceLanguage);
          const transcript = String(result?.transcript || '').trim();
          if (!transcript) throw new Error('لم يتم العثور على كلام واضح في التسجيل.');
          setInput(transcript);
          void handleSend(transcript, {
            inputMode: 'voice',
            speakResponse: true,
            language: voiceLanguage,
            voiceMetadata: {
              sessionId: `voice-${Date.now()}`,
              language: result.language || voiceLanguage,
              transcriptionStatus: 'completed',
              audioMimeType: audio.type,
              durationMs: result.durationMs || Date.now() - (recordingStartedAtRef.current || Date.now()),
              capturedAt: new Date().toISOString(),
              audioStored: false,
              transcriptionLatencyMs: result.latencyMs,
              languageProbability: result.languageProbability,
            },
          });
        } catch (error: any) {
          const message = error?.response?.data?.message || error?.message;
          setVoiceError(Array.isArray(message) ? message.join('، ') : (message || 'تعذر فهم التسجيل الصوتي.'));
          setVoiceState('ERROR');
        } finally {
          recordingStartedAtRef.current = null;
        }
      };
      recorder.start();
    } catch (error: any) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      setVoiceError(error?.message || 'اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.');
      setVoiceState('ERROR');
    }
  }, [convId, handleSend, voiceLanguage]);

  const stopVoiceCapture = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      setVoiceState('IDLE');
    }
  }, []);

  const stopAllStreams = useCallback(() => {
    streamControllersRef.current.forEach((controller) => controller.abort());
    if (recorderRef.current) stopVoiceCapture();
    audioRef.current?.pause();
    audioRef.current = null;
    setVoiceState('STOPPED');
  }, [stopVoiceCapture]);

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
    <div className="relative flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-gray-200 bg-white h-14 flex-shrink-0 safe-area-x">
        <button
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition lg:hidden"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowTaskAssistant((visible) => !visible)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-arabic transition',
            showTaskAssistant
              ? 'border-[#b8ddc7] bg-[#eef8f2] text-[#187b57]'
              : 'border-gray-200 text-gray-500 hover:border-[#c9e2d3] hover:bg-[#f5faf7]',
          )}
          aria-expanded={showTaskAssistant}
          aria-controls="thanarah-task-assistant"
        >
          <ListTodo className="h-3.5 w-3.5" />
          مساعد المهام
        </button>
        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] sm:text-xs text-amber-800 font-arabic whitespace-nowrap" dir="rtl">
          نسخة تجريبية · اكتمال المشروع 100%
        </span>
      </div>

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
            key={msg._id || msg.clientId || idx}
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
          className="flex flex-col gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-thanarah-400 focus-within:ring-1 focus-within:ring-thanarah-400 transition"
          dir="rtl"
        >
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".txt,.md,.markdown,.csv,.tsv,.json,.xml,.html,.htm,.log,.pdf,text/plain,text/csv,application/json,application/pdf"
              onChange={handleFileSelected}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtractingFile}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-arabic text-gray-500 transition hover:bg-gray-100 hover:text-thanarah-700 disabled:cursor-wait disabled:opacity-60"
              title="إرفاق ملف لتحليله"
            >
              {isExtractingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              إرفاق ملف
            </button>
            <button
              type="button"
              onClick={() => { setInputMode('text'); setVoiceState('IDLE'); }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-arabic transition',
                inputMode === 'text' ? 'bg-thanarah-100 text-thanarah-800' : 'text-gray-500 hover:bg-gray-100',
              )}
              aria-pressed={inputMode === 'text'}
            >
              <Type className="h-3.5 w-3.5" />
              Text
            </button>
            <button
              type="button"
              onClick={() => { setInputMode('voice'); setVoiceError(''); }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-arabic transition',
                inputMode === 'voice' ? 'bg-thanarah-100 text-thanarah-800' : 'text-gray-500 hover:bg-gray-100',
              )}
              aria-pressed={inputMode === 'voice'}
              title="التحدث بالميكروفون"
            >
              <Mic className="h-3.5 w-3.5" />
              Voice
            </button>
            <button
              type="button"
              onClick={() => setShowTools((visible) => !visible)}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full transition',
                showTools ? 'bg-thanarah-100 text-thanarah-800' : 'text-gray-500 hover:bg-gray-100',
              )}
              aria-label="فتح الأدوات"
              aria-expanded={showTools}
              title="اختيار أداة"
            >
              <Wand2 className="h-3.5 w-3.5" />
            </button>
            {selectedSkillId && (
              <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-thanarah-50 px-2 py-1 text-[10px] text-thanarah-800 font-arabic">
                <Sparkles className="h-3 w-3" />
                {skills.find((skill) => skill.id === selectedSkillId)?.name || selectedSkillId}
              </span>
            )}
          </div>

          {showTools && (
            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm" role="menu" aria-label="أدوات المحادثة">
              <div className="mb-1 px-2 text-[10px] text-gray-400 font-arabic">اختر الأداة التي ستستخدمها في هذه الرسالة</div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {skills.map((skill) => {
                  const available = skill.enabled && skill.implementationStatus !== 'contract-only';
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      disabled={!available}
                      onClick={() => { setSelectedSkillId(skill.id); setShowTools(false); }}
                      className={cn(
                        'flex items-center justify-between rounded-lg border px-2.5 py-2 text-right text-[11px] font-arabic transition',
                        available
                          ? 'border-gray-200 text-gray-700 hover:border-thanarah-300 hover:bg-thanarah-50'
                          : 'cursor-not-allowed border-gray-100 text-gray-300',
                      )}
                      role="menuitem"
                    >
                      <span>{skill.name}</span>
                      <span className="text-[9px]">{available ? 'متاحة' : 'غير متاحة'}</span>
                    </button>
                  );
                })}
                {skills.length === 0 && (
                  <span className="px-2 py-1 text-[11px] text-gray-400 font-arabic">لا توجد أدوات متاحة الآن</span>
                )}
              </div>
            </div>
          )}

          {inputMode === 'voice' && (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-500 font-arabic">
              <Mic className={cn('h-4 w-4', voiceState === 'LISTENING' ? 'text-red-500' : 'text-gray-400')} />
              <span>
                {voiceError
                  ? voiceError
                  : voiceState === 'LISTENING'
                    ? 'جاري الاستماع...'
                    : voiceState === 'SPEAKING'
                      ? 'جاري قراءة الرد...'
                        : voiceAvailable
                          ? 'اضغط الميكروفون للتحدث'
                          : 'الصوت المحلي غير متاح حاليًا'}
              </span>
              <span className="mr-auto rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px]">
                {voiceState}
              </span>
              <button
                type="button"
                disabled={voiceState === 'SPEAKING'}
                onClick={voiceState === 'LISTENING' ? stopVoiceCapture : startVoiceCapture}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-50',
                  voiceState === 'LISTENING' ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 hover:bg-gray-50',
                )}
                title="تشغيل الميكروفون"
              >
                <Mic className="h-3 w-3" />
                {voiceState === 'LISTENING' ? 'إيقاف' : 'تحدث'}
              </button>
              <select
                value={voiceLanguage}
                onChange={(event) => setVoiceLanguage(event.target.value as 'ar' | 'en')}
                className="rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-[10px] text-gray-600 outline-none"
                aria-label="لغة الصوت"
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
          )}

          {(attachments.length > 0 || attachmentError) && (
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2" dir="rtl">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map((file) => (
                    <span key={file.name} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-thanarah-50 px-2 py-1 text-[10px] text-thanarah-800">
                      <FileText className="h-3 w-3 flex-shrink-0" />
                      <span className="max-w-[170px] truncate font-arabic">{file.name}</span>
                      <button type="button" onClick={() => removeAttachment(file.name)} className="rounded-full p-0.5 hover:bg-thanarah-100" aria-label={`إزالة ${file.name}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {attachmentError && <p className="mt-1 text-[10px] text-red-600 font-arabic">{attachmentError}</p>}
            </div>
          )}

          <div className="flex w-full items-end gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
              onKeyDown={handleKeyDown}
              placeholder={inputMode === 'voice'
                ? 'تحدث من زر الميكروفون أو اكتب هنا...'
                : 'اكتب رسالتك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)'}
              className="flex-1 bg-transparent resize-none outline-none text-base sm:text-sm text-gray-800 placeholder-gray-400 font-arabic leading-relaxed max-h-40"
              rows={1}
              dir={isRTL(input) ? 'rtl' : 'ltr'}
              style={{ minHeight: '24px' }}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              {activeRequestCount > 0 && (
                <button
                  onClick={stopAllStreams}
                  className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-lg transition"
                  title="إيقاف الردود الجارية"
                >
                  <Square className="w-3.5 h-3.5 text-gray-600 fill-gray-600" />
                </button>
              )}
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() && attachments.length === 0}
                className="w-8 h-8 flex items-center justify-center bg-thanarah-700 hover:bg-thanarah-600 disabled:bg-gray-200 rounded-lg transition disabled:cursor-not-allowed"
                title="إرسال رسالة جديدة"
              >
                <Send className="w-3.5 h-3.5 text-white disabled:text-gray-400" />
              </button>
            </div>
          </div>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-2 font-arabic">
          ثنارة AI قد يرتكب أخطاء. تحقق من المعلومات المهمة.
        </p>
      </div>
      </div>
      {showTaskAssistant && (
        <div id="thanarah-task-assistant" className="absolute inset-0 z-20 lg:static lg:inset-auto">
          <TaskAssistantPanel
            storageKey={`thanarah-assistant-tasks:${(user as any)?._id || (user as any)?.id || 'current'}`}
            onClose={() => setShowTaskAssistant(false)}
            onAskAboutTask={askAboutTask}
          />
        </div>
      )}
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
                {!message.isStreaming && (message.aiMetadata?.ragSources?.length || 0) > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-3" dir="rtl">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 font-arabic">
                      <Globe2 className="h-3.5 w-3.5 text-thanarah-600" />
                      مصادر الويب
                    </div>
                    <div className="grid gap-1.5">
                      {message.aiMetadata?.ragSources?.map((source: any, sourceIndex: number) => (
                        <a
                          key={`${source.id || source.url || 'source'}-${sourceIndex}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-[10px] text-gray-600 transition hover:border-thanarah-200 hover:bg-thanarah-50"
                        >
                          <span className="min-w-0 flex-1 truncate font-arabic">
                            [{source.id || `source-${sourceIndex + 1}`}] {source.title || source.domain || source.url}
                          </span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0 text-gray-400" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
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
