import { Prisma, type PrismaClient } from "@prisma/client";
import { i18next } from "../../core/i18n.js";
import { logger } from "../../core/logger.js";
import { NotFoundError } from "../../core/errors.js";

/**
 * Notification Service
 *
 * Sends notifications across multiple channels (email, SMS, webhook, in-app, push)
 * with full i18n support. Templates are resolved by notification code + channel + language.
 *
 * Template variables use {{variable}} syntax and are interpolated from the data payload.
 */
export class NotificationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Send a notification using a template.
   *
   * @param code Template code (e.g. "TRANSFER_COMPLETED")
   * @param channel Notification channel
   * @param language Recipient's preferred language
   * @param recipient Email/phone/webhook URL/user ID
   * @param data Template variable values
   * @param merchantId Optional merchant association
   */
  async send(input: {
    code: string;
    channel: "EMAIL" | "SMS" | "WEBHOOK" | "IN_APP" | "PUSH";
    language?: string;
    recipient: string;
    data: Record<string, string>;
    merchantId?: string;
    type?: string;
  }) {
    const lang = input.language ?? "en";

    // Find template for this code + channel + language
    let template = await this.prisma.notificationTemplate.findUnique({
      where: {
        code_channel_language: {
          code: input.code,
          channel: input.channel,
          language: lang,
        },
      },
    });

    // Fall back to English if no template in requested language
    if (!template && lang !== "en") {
      template = await this.prisma.notificationTemplate.findUnique({
        where: {
          code_channel_language: {
            code: input.code,
            channel: input.channel,
            language: "en",
          },
        },
      });
    }

    if (!template) {
      // If no template in DB, use i18next translations as fallback
      const tKey = `notifications:${input.code}`;
      const i18nSubject = i18next.t(`${tKey}.subject`, { lng: lang, ...input.data }) as string;
      const i18nBody = i18next.t(`${tKey}.body`, { lng: lang, ...input.data }) as string;

      if (i18nSubject && i18nBody && i18nSubject !== `${tKey}.subject`) {
        return this.createAndDispatch({
          merchantId: input.merchantId,
          type: (input.type as never) ?? "TRANSACTION",
          channel: input.channel,
          subject: i18nSubject,
          body: i18nBody,
          language: lang,
          recipient: input.recipient,
        });
      }

      logger.warn({ code: input.code, channel: input.channel, language: lang }, "No notification template found");
      throw new NotFoundError("Notification template", `${input.code}/${input.channel}/${lang}`);
    }

    // Interpolate template variables
    const subject = this.interpolate(template.subject ?? "", input.data);
    const body = this.interpolate(template.body, input.data);

    return this.createAndDispatch({
      merchantId: input.merchantId,
      type: (input.type as never) ?? "TRANSACTION",
      channel: input.channel,
      subject,
      body,
      language: lang,
      recipient: input.recipient,
    });
  }

  /**
   * Create a notification template.
   */
  async createTemplate(input: {
    code: string;
    type: "TRANSACTION" | "TRANSFER" | "SETTLEMENT" | "ALERT" | "SYSTEM" | "COMPLIANCE";
    channel: "EMAIL" | "SMS" | "WEBHOOK" | "IN_APP" | "PUSH";
    language: string;
    subject?: string;
    body: string;
  }) {
    return this.prisma.notificationTemplate.create({
      data: {
        code: input.code,
        type: input.type,
        channel: input.channel,
        language: input.language,
        subject: input.subject,
        body: input.body,
      },
    });
  }

  async listTemplates(filters: { code?: string; language?: string; channel?: string }) {
    const where: Prisma.NotificationTemplateWhereInput = {};
    if (filters.code) where.code = filters.code;
    if (filters.language) where.language = filters.language;
    if (filters.channel) where.channel = filters.channel as never;

    return this.prisma.notificationTemplate.findMany({
      where,
      orderBy: [{ code: "asc" }, { language: "asc" }],
    });
  }

  async listNotifications(filters: {
    merchantId?: string;
    type?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.NotificationWhereInput = {};
    if (filters.merchantId) where.merchantId = filters.merchantId;
    if (filters.type) where.type = filters.type as never;
    if (filters.status) where.status = filters.status;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── Private Helpers ──────────────────────────────

  private async createAndDispatch(input: {
    merchantId?: string;
    type: never;
    channel: "EMAIL" | "SMS" | "WEBHOOK" | "IN_APP" | "PUSH";
    subject: string;
    body: string;
    language: string;
    recipient: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        merchantId: input.merchantId,
        type: input.type,
        channel: input.channel as never,
        title: input.subject,
        message: input.body,
        language: input.language,
        status: "PENDING",
        recipient: input.recipient,
      },
    });

    // In a production system, this would dispatch to an actual channel
    // (email service, SMS gateway, webhook HTTP call, push notification service).
    // For now, we mark it as SENT and log.
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    logger.info(
      { notificationId: notification.id, code: input.type, channel: input.channel, recipient: input.recipient, language: input.language },
      "Notification sent",
    );

    return notification;
  }

  private interpolate(template: string, data: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      return data[key] ?? `{{${key}}}`;
    });
  }
}
