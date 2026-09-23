import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { PushSubscription, PushSubscriptionDocument } from './schemas/push-subscription.schema';
import * as webpush from 'web-push';
import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage, Server } from 'http';

export interface FireNotificationInput {
  tenantId: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

type ConnectedClient = { socket: WebSocket; tenantId: string; userId: string };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly clients = new Set<ConnectedClient>();
  private readonly wss = new WebSocketServer({ noServer: true });
  private pushReady = false;

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(PushSubscription.name) private readonly subscriptionModel: Model<PushSubscriptionDocument>,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {
    const subject = this.config.get<string>('notifications.vapidSubject');
    const publicKey = this.config.get<string>('notifications.vapidPublicKey');
    const privateKey = this.config.get<string>('notifications.vapidPrivateKey');
    if (subject && publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.pushReady = true;
    }
  }

  attachHttpServer(server: Server): void {
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      let url: URL;
      try {
        url = new URL(request.url || '/', 'http://localhost');
      } catch {
        socket.destroy();
        return;
      }
      if (url.pathname !== '/api/notifications/ws') return;
      const token = url.searchParams.get('token');
      this.wss.handleUpgrade(request, socket, head, (client) => {
        void this.authenticateSocket(client, token);
      });
    });
  }

  async fireNotify(input: FireNotificationInput): Promise<NotificationDocument | null> {
    const payload = {
      tenantId: input.tenantId,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      data: input.data || {},
    };
    let notification: NotificationDocument | null = null;
    try {
      notification = await this.notificationModel.create(payload);
    } catch (error) {
      this.logger.warn(`Notification persistence failed: ${error.message}`);
    }

    const publicPayload = {
      id: notification?._id?.toString(),
      ...payload,
      createdAt: notification?.createdAt || new Date().toISOString(),
    };
    this.broadcast(input.tenantId, input.userId, publicPayload);
    await this.sendPush(input.tenantId, input.userId, publicPayload);
    return notification;
  }

  async list(tenantId: string, userId: string, limit = 50) {
    return this.notificationModel
      .find({ tenantId, userId })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();
  }

  async markRead(tenantId: string, userId: string, id: string) {
    return this.notificationModel.findOneAndUpdate(
      { _id: id, tenantId, userId },
      { $set: { readAt: new Date() } },
      { new: true },
    ).lean();
  }

  async saveSubscription(
    tenantId: string,
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null },
    userAgent?: string,
  ) {
    return this.subscriptionModel.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      { $set: { tenantId, userId, ...subscription, userAgent, lastUsedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }

  async removeSubscription(userId: string, endpoint: string) {
    await this.subscriptionModel.deleteOne({ userId, endpoint });
    return { success: true };
  }

  getPushConfig() {
    return {
      enabled: this.pushReady,
      publicKey: this.pushReady ? this.config.get<string>('notifications.vapidPublicKey') : null,
    };
  }

  private async authenticateSocket(socket: WebSocket, token: string | null) {
    if (!token) {
      socket.close(1008, 'Authentication required');
      return;
    }
    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
      const user = await this.users.findById(payload.sub);
      if (!user?.isActive || !user.tenantId) throw new Error('Invalid principal');
      const client = { socket, tenantId: user.tenantId.toString(), userId: user._id.toString() };
      this.clients.add(client);
      socket.on('close', () => this.clients.delete(client));
      socket.on('error', () => this.clients.delete(client));
      socket.send(JSON.stringify({ type: 'ready' }));
    } catch {
      socket.close(1008, 'Invalid authentication');
    }
  }

  private broadcast(tenantId: string, userId: string, payload: Record<string, unknown>) {
    const message = JSON.stringify({ type: 'notification', notification: payload });
    for (const client of this.clients) {
      if (client.tenantId !== tenantId || client.userId !== userId) continue;
      if (client.socket.readyState === WebSocket.OPEN) client.socket.send(message);
    }
  }

  private async sendPush(tenantId: string, userId: string, payload: Record<string, unknown>) {
    if (!this.pushReady) return;
    const subscriptions = await this.subscriptionModel.find({ tenantId, userId }).lean().catch(() => []);
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          JSON.stringify(payload),
        );
        await this.subscriptionModel.updateOne(
          { _id: subscription._id },
          { $set: { lastUsedAt: new Date() } },
        );
      } catch (error) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await this.subscriptionModel.deleteOne({ _id: subscription._id });
        } else {
          this.logger.warn(`Web Push delivery failed: ${String(error?.message || error).slice(0, 160)}`);
        }
      }
    }));
  }
}
