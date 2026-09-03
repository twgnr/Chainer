import nodemailer from "nodemailer";

export interface NotifyTarget {
  email?: string;
  telegramChatId?: string;
  webhookUrl?: string;
}

export interface NotifyMessage {
  subject: string;
  text: string;
  url?: string;
}

export interface NotifyResult {
  channel: string;
  ok: boolean;
  error?: string;
}

function smtpConfigured() {
  return !!process.env.SMTP_HOST && !!process.env.SMTP_FROM;
}

let transport: nodemailer.Transporter | null = null;
function mailer() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transport;
}

async function sendMail(to: string, msg: NotifyMessage): Promise<NotifyResult> {
  if (!smtpConfigured()) return { channel: "email", ok: false, error: "SMTP nicht konfiguriert" };
  try {
    await mailer().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: msg.subject,
      text: msg.url ? `${msg.text}\n\n${msg.url}` : msg.text,
    });
    return { channel: "email", ok: true };
  } catch (e) {
    return { channel: "email", ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendTelegram(chatId: string, msg: NotifyMessage): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { channel: "telegram", ok: false, error: "TELEGRAM_BOT_TOKEN nicht gesetzt" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `*${msg.subject}*\n${msg.text}${msg.url ? `\n${msg.url}` : ""}`,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) return { channel: "telegram", ok: false, error: `HTTP ${res.status}` };
    return { channel: "telegram", ok: true };
  } catch (e) {
    return { channel: "telegram", ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendWebhook(url: string, msg: NotifyMessage): Promise<NotifyResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...msg, source: "chainer", at: new Date().toISOString() }),
    });
    if (!res.ok) return { channel: "webhook", ok: false, error: `HTTP ${res.status}` };
    return { channel: "webhook", ok: true };
  } catch (e) {
    return { channel: "webhook", ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Verschickt eine Nachricht über alle konfigurierten Kanäle des Ziels. */
export async function notify(target: NotifyTarget, msg: NotifyMessage): Promise<NotifyResult[]> {
  const jobs: Promise<NotifyResult>[] = [];
  if (target.email) jobs.push(sendMail(target.email, msg));
  if (target.telegramChatId) jobs.push(sendTelegram(target.telegramChatId, msg));
  if (target.webhookUrl) jobs.push(sendWebhook(target.webhookUrl, msg));
  if (!jobs.length) return [];
  return Promise.all(jobs);
}

export function notifyChannelsAvailable() {
  return {
    email: smtpConfigured(),
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
    webhook: true,
  };
}
