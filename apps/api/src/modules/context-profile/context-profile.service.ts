import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContextProfile, ContextProfileDocument } from './schemas/context-profile.schema';

const TOPIC_RULES: Array<{ topic: string; terms: string[] }> = [
  { topic: 'appointments', terms: ['موعد', 'مواعيد', 'حجز', 'appointment', 'booking'] },
  { topic: 'patients', terms: ['مريض', 'مرضى', 'patient', 'patients'] },
  { topic: 'doctors', terms: ['طبيب', 'أطباء', 'دكتور', 'doctor', 'doctors'] },
  { topic: 'insurance', terms: ['تأمين', 'insurance', 'ضمان'] },
  { topic: 'billing', terms: ['فاتورة', 'فواتير', 'billing', 'invoice', 'دفع'] },
  { topic: 'marketing', terms: ['تسويق', 'marketing', 'إعلان', 'campaign'] },
  { topic: 'sales', terms: ['مبيعات', 'sales', 'بيع'] },
  { topic: 'customer-service', terms: ['خدمة العملاء', 'عميل', 'customer service'] },
  { topic: 'operations', terms: ['تشغيل', 'عمليات', 'operations', 'إجراءات'] },
];

@Injectable()
export class ContextProfileService {
  constructor(
    @InjectModel(ContextProfile.name)
    private readonly profileModel: Model<ContextProfileDocument>,
  ) {}

  private scope(tenantId: string, userId: string) {
    return {
      tenantId: new Types.ObjectId(tenantId),
      organizationId: new Types.ObjectId(tenantId),
      userId: new Types.ObjectId(userId),
    };
  }

  private defaults(tenantId: string, userId: string) {
    return {
      ...this.scope(tenantId, userId),
      organizationContext: {},
      userContext: {},
      frequentTopics: [],
      recentTopics: [],
      frequentTasks: [],
      knownPreferences: [],
      importantEntities: [],
      topicEvidence: {},
      recentActivity: [],
      onboardingDismissed: false,
    };
  }

  async getForUser(tenantId: string, userId: string): Promise<any> {
    const profile = await this.profileModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) })
      .lean();
    return profile || this.defaults(tenantId, userId);
  }

  async getForAi(tenantId: string, userId: string): Promise<Record<string, unknown>> {
    const profile = await this.getForUser(tenantId, userId);
    return {
      organizationContext: profile.organizationContext || {},
      userContext: profile.userContext || {},
      frequentTopics: profile.frequentTopics || [],
      recentTopics: profile.recentTopics || [],
      frequentTasks: profile.frequentTasks || [],
      knownPreferences: profile.knownPreferences || [],
    };
  }

  async updateForUser(tenantId: string, userId: string, input: any): Promise<any> {
    const set: Record<string, unknown> = {};
    if (input && Object.prototype.hasOwnProperty.call(input, 'organizationContext')) {
      const organizationContext = input.organizationContext || {};
      set.organizationContext = {
        industry: String(organizationContext.industry || '').trim().slice(0, 80),
        specialization: String(organizationContext.specialization || '').trim().slice(0, 120),
        additionalInstructions: String(organizationContext.additionalInstructions || '').trim().slice(0, 1200),
      };
    }
    if (input && Object.prototype.hasOwnProperty.call(input, 'userContext')) {
      const userContext = input.userContext || {};
      const allowedLanguage = userContext.preferredLanguage;
      const allowedStyle = ['professional', 'friendly', 'concise', 'detailed'].includes(
        userContext.preferredResponseStyle,
      )
        ? userContext.preferredResponseStyle
        : undefined;
      set.userContext = {
        preferredLanguage: allowedLanguage === 'en' ? 'en' : 'ar',
        preferredResponseStyle: allowedStyle || 'concise',
      };
    }
    if (input && Object.prototype.hasOwnProperty.call(input, 'frequentTasks')) {
      set.frequentTasks = Array.isArray(input.frequentTasks)
        ? input.frequentTasks.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 8)
        : [];
    }
    if (input && Object.prototype.hasOwnProperty.call(input, 'knownPreferences')) {
      set.knownPreferences = Array.isArray(input.knownPreferences)
        ? input.knownPreferences.map((item: unknown) => String(item).trim().slice(0, 120)).filter(Boolean).slice(0, 12)
        : [];
    }
    if (typeof input?.onboardingDismissed === 'boolean') {
      set.onboardingDismissed = input.onboardingDismissed;
      set.onboardingDismissedAt = input.onboardingDismissed ? new Date() : null;
    }

    return this.profileModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) },
      {
        $set: set,
        $setOnInsert: this.scope(tenantId, userId),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }

  async deleteForUser(tenantId: string, userId: string): Promise<void> {
    await this.profileModel.deleteOne({
      tenantId: new Types.ObjectId(tenantId),
      userId: new Types.ObjectId(userId),
    });
  }

  async recordInteraction(tenantId: string, userId: string, text: string): Promise<void> {
    const normalized = String(text || '').toLowerCase();
    const topics = TOPIC_RULES
      .filter((rule) => rule.terms.some((term) => normalized.includes(term.toLowerCase())))
      .map((rule) => rule.topic);
    if (!topics.length) return;

    const profile = await this.getForUser(tenantId, userId);
    const evidence = { ...(profile.topicEvidence || {}) };
    topics.forEach((topic) => {
      evidence[topic] = Number(evidence[topic] || 0) + 1;
    });
    const recentTopics = [...new Set([...topics, ...(profile.recentTopics || [])])].slice(0, 8);
    const frequentTopics = Object.entries(evidence)
      .filter(([, count]) => Number(count) >= 2)
      .sort(([, left], [, right]) => Number(right) - Number(left))
      .map(([topic]) => topic)
      .slice(0, 8);

    await this.profileModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) },
      {
        $set: {
          topicEvidence: evidence,
          recentTopics,
          frequentTopics,
          recentActivity: [
            { type: 'conversation', at: new Date(), topics },
            ...(profile.recentActivity || []),
          ].slice(0, 12),
        },
        $setOnInsert: this.defaults(tenantId, userId),
      },
      { upsert: true, new: true },
    );
  }

  async suggestions(tenantId: string, userId: string): Promise<any> {
    const profile = await this.getForUser(tenantId, userId);
    const topics = [...new Set([
      ...(profile.frequentTopics || []),
      ...(profile.recentTopics || []),
      ...(profile.frequentTasks || []),
    ])];
    if (!topics.length) {
      return {
        mode: 'welcome',
        isNewUser: true,
        suggestions: [],
        profile,
      };
    }

    const labels: Record<string, string> = {
      appointments: 'راجع مواعيد اليوم',
      patients: 'لخّص أسئلة المرضى المتكررة',
      doctors: 'راجع توزيع مواعيد الأطباء',
      insurance: 'راجع خدمات التأمين المرتبطة بعملك',
      billing: 'ساعدني في متابعة الفواتير',
      marketing: 'اقترح فكرة تسويقية مناسبة لعملي',
      sales: 'حلل فرص المبيعات الأخيرة',
      'customer-service': 'حسّن طريقة خدمة العملاء',
      operations: 'راجع إجراءات العمل الحالية',
    };
    const suggestions = topics
      .map((topic) => labels[topic] || topic)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 4);
    return { mode: 'personalized', isNewUser: false, suggestions, profile };
  }
}