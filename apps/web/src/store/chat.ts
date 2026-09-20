'use client';
import { create } from 'zustand';

export interface Message {
  _id?: string;
  clientId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  inputMode?: 'text' | 'voice';
  voiceMetadata?: {
    sessionId?: string;
    language?: 'ar' | 'en';
    transcriptionStatus?: 'pending' | 'completed' | 'failed';
    audioMimeType?: string;
    durationMs?: number;
  };
  isStreaming?: boolean;
  streamStatus?: 'analyzing' | 'generating' | 'stopped';
  isPinned?: boolean;
  feedback?: {
    rating?: 'up' | 'down';
    correction?: string;
    createdAt?: string;
  };
  aiMetadata?: {
    model?: string;
    backend?: string;
    routeDecision?: string;
    latency?: number;
    ragSources?: any[];
  };
  createdAt?: string;
}

export interface Conversation {
  _id: string;
  title: string;
  isPinned?: boolean;
  messageCount: number;
  lastMessageAt?: string;
  createdAt?: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  isLoading: boolean;
  isStreaming: boolean;
  sidebarOpen: boolean;
  
  setConversations: (convs: Conversation[]) => void;
  addConversation: (conv: Conversation) => void;
  updateConversation: (id: string, data: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  
  setMessages: (convId: string, msgs: Message[]) => void;
  addMessage: (convId: string, msg: Message) => void;
  updateLastMessage: (
    convId: string,
    content: string,
    done?: boolean,
    streamStatus?: Message['streamStatus'],
  ) => void;
  updateStreamingMessage: (
    convId: string,
    clientId: string,
    content: string,
    done?: boolean,
    streamStatus?: Message['streamStatus'],
  ) => void;
  finalizeLastMessage: (convId: string, content: string, meta?: any) => void;
  finalizeMessage: (convId: string, clientId: string, content: string, meta?: any) => void;
  updateMessage: (convId: string, messageId: string, data: Partial<Message>) => void;
  
  setLoading: (v: boolean) => void;
  setStreaming: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebar: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isLoading: false,
  isStreaming: false,
  sidebarOpen: false,

  setConversations: (convs) => set({ conversations: convs }),
  addConversation: (conv) =>
    set((s) => ({ conversations: [conv, ...s.conversations] })),
  updateConversation: (id, data) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c._id === id ? { ...c, ...data } : c
      ),
    })),
  removeConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c._id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
    })),
  setActiveConversation: (id) => set({ activeConversationId: id }),

  setMessages: (convId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [convId]: msgs } })),
  addMessage: (convId, msg) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [convId]: [...(s.messages[convId] || []), msg],
      },
    })),
  updateLastMessage: (convId, content, done = false, streamStatus) =>
    set((s) => {
      const msgs = [...(s.messages[convId] || [])];
      if (msgs.length === 0) return s;
      const last = { ...msgs[msgs.length - 1] };
      last.content = content;
      last.isStreaming = !done;
      if (streamStatus) last.streamStatus = streamStatus;
      if (done && !streamStatus) delete last.streamStatus;
      msgs[msgs.length - 1] = last;
      return { messages: { ...s.messages, [convId]: msgs } };
    }),
  updateStreamingMessage: (convId, clientId, content, done = false, streamStatus) =>
    set((s) => {
      const messages = (s.messages[convId] || []).map((message) => {
        if (message.clientId !== clientId) return message;
        const next = { ...message, content, isStreaming: !done };
        if (streamStatus) next.streamStatus = streamStatus;
        if (done && !streamStatus) delete next.streamStatus;
        return next;
      });
      return { messages: { ...s.messages, [convId]: messages } };
    }),
  finalizeLastMessage: (convId, content, meta = {}) =>
    set((s) => {
      const msgs = [...(s.messages[convId] || [])];
      if (msgs.length === 0) return s;
      const last = { ...msgs[msgs.length - 1] };
      last.content = content;
      last.isStreaming = false;
      if (meta.stopped) {
        last.streamStatus = 'stopped';
      } else {
        delete last.streamStatus;
      }
      if (meta.messageId) last._id = String(meta.messageId);
      last.aiMetadata = { ...(last.aiMetadata || {}), ...meta };
      msgs[msgs.length - 1] = last;
      if (meta.userMessageId) {
        for (let index = msgs.length - 2; index >= 0; index -= 1) {
          if (msgs[index].role === 'user' && !msgs[index]._id) {
            msgs[index] = { ...msgs[index], _id: String(meta.userMessageId) };
            break;
          }
        }
      }
      return { messages: { ...s.messages, [convId]: msgs } };
    }),
  finalizeMessage: (convId, clientId, content, meta = {}) =>
    set((s) => {
      const messages = (s.messages[convId] || []).map((message) => {
        if (message.clientId !== clientId) return message;
        const next = { ...message, content, isStreaming: false };
        if (meta.stopped) next.streamStatus = 'stopped';
        else delete next.streamStatus;
        if (meta.messageId) next._id = String(meta.messageId);
        next.aiMetadata = { ...(next.aiMetadata || {}), ...meta };
        return next;
      });
      if (meta.userMessageId && meta.userClientId) {
        const userMessage = messages.find((message) => message.clientId === meta.userClientId);
        if (userMessage) userMessage._id = String(meta.userMessageId);
      }
      return { messages: { ...s.messages, [convId]: messages } };
    }),
  updateMessage: (convId, messageId, data) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [convId]: (s.messages[convId] || []).map((message) =>
          message._id === messageId ? { ...message, ...data } : message
        ),
      },
    })),

  setLoading: (v) => set({ isLoading: v }),
  setStreaming: (v) => set({ isStreaming: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar: (v) => set({ sidebarOpen: v }),
}));
