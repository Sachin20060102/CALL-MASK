import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppEnv } from '../../config/env.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { verifyAccessToken } from '../../lib/auth.js';
import { resolveAllowOriginHeader } from '../../lib/cors.js';
import { AppError } from '../../lib/errors.js';
import { mapTwilioStatus } from '../telephony/twilioTelephony.adapter.js';
import { TelephonyService } from '../telephony/telephony.service.js';
import { CallEventsHub } from './callEvents.hub.js';
import { CallsService } from './calls.service.js';

const initiateCallSchema = z.object({
  callerIdId: z.string().min(1),
  destinationNumber: z.string().min(4).max(32),
  transport: z.enum(['AUTO', 'REST', 'WEBRTC']).optional(),
});

const muteSchema = z.object({
  muted: z.boolean(),
});

const listCallsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELED', 'BLOCKED'])
    .optional(),
  search: z.string().optional(),
});

const webhookStatusSchema = z.object({
  providerCallId: z.string().min(1),
  status: z.enum(['INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELED']),
  terminationReason: z.string().optional(),
  failureCode: z.string().optional(),
  providerReportedCostMicros: z.number().int().nonnegative().optional(),
  providerCurrency: z.string().max(8).optional(),
});

export function registerCallRoutes(
  app: FastifyInstance,
  deps: {
    prisma: AppPrismaClient;
    env: AppEnv;
    callsService: CallsService;
    telephonyService: TelephonyService;
    eventsHub: CallEventsHub;
    requireAuth: (req: never) => Promise<void>;
  }
) {
  app.post('/api/v1/calls', { preHandler: deps.requireAuth as never }, async (request, reply) => {
    const body = initiateCallSchema.parse(request.body);
    const result = await deps.callsService.initiateCall(
      request.authUser!,
      body,
      request.ip
    );
    return reply.status(201).send(result);
  });

  app.get('/api/v1/calls', { preHandler: deps.requireAuth as never }, async (request) => {
    const query = listCallsQuerySchema.parse(request.query);
    const where: Record<string, unknown> = {
      userId: request.authUser!.id,
    };
    if (query.status) {
      where.status = query.status;
    }
    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { destinationNumber: { contains: term } },
        { callerIdNumber: { contains: term } },
        { providerCallId: { contains: term } },
      ];
    }

    const [items, total] = await Promise.all([
      deps.prisma.callRecord.findMany({
        where: where as never,
        orderBy: { startedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      deps.prisma.callRecord.count({ where: where as never }),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  });

  app.get('/api/v1/calls/stream', async (request, reply) => {
    const query = request.query as { accessToken?: string };
    const authHeader = request.headers.authorization;
    const rawToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : query.accessToken?.trim();

    if (!rawToken) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing access token for call event stream');
    }

    let claims;
    try {
      claims = await verifyAccessToken(rawToken, deps.env.JWT_ACCESS_SECRET);
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired access token');
    }

    const user = await deps.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.status === 'SUSPENDED') {
      throw new AppError(403, 'FORBIDDEN', 'Account unavailable');
    }

    const allowOrigin = resolveAllowOriginHeader(
      typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
      deps.env.CORS_ORIGIN
    );

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin } : {}),
    });
    reply.raw.write('retry: 3000\n\n');
    reply.raw.write(': connected\n\n');

    const unsubscribe = deps.eventsHub.subscribe(user.id, (event) => {
      reply.raw.write(`event: call.status\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 15000);
    heartbeat.unref();

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get('/api/v1/calls/:id', { preHandler: deps.requireAuth as never }, async (request) => {
    const { id } = request.params as { id: string };
    const call = await deps.prisma.callRecord.findUnique({
      where: { id },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!call) {
      throw new AppError(404, 'CALL_NOT_FOUND', 'Call record not found');
    }
    if (call.userId !== request.authUser!.id && request.authUser!.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'You cannot view another user call');
    }
    return { call };
  });

  app.post('/api/v1/calls/:id/mute', { preHandler: deps.requireAuth as never }, async (request) => {
    const { id } = request.params as { id: string };
    const body = muteSchema.parse(request.body);
    const call = await deps.callsService.setMute(request.authUser!, id, body.muted);
    return { call };
  });

  app.post('/api/v1/calls/:id/end', { preHandler: deps.requireAuth as never }, async (request) => {
    const { id } = request.params as { id: string };
    const call = await deps.callsService.endCall(request.authUser!, id);
    return { call };
  });

  // Operational VoIP/SIP status callback (no payment webhooks exist anywhere)
  app.post('/api/v1/telephony/webhooks/status', async (request) => {
    if (!deps.env.TELEPHONY_ENABLED || !deps.env.TELEPHONY_COMPLIANCE_VERIFIED) {
      throw new AppError(
        503,
        'TELEPHONY_DISABLED',
        'Live telephony webhooks are inactive while telephony is disabled'
      );
    }

    const signature = request.headers['x-telephony-signature'];
    const rawPayload = JSON.stringify(request.body ?? {});
    const isValid = deps.telephonyService.verifyWebhookSignature(
      rawPayload,
      typeof signature === 'string' ? signature : undefined
    );
    if (!isValid) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid telephony webhook signature');
    }

    const body = webhookStatusSchema.parse(request.body);
    const call = await deps.prisma.callRecord.findUnique({
      where: { providerCallId: body.providerCallId },
    });
    if (!call) {
      throw new AppError(404, 'CALL_NOT_FOUND', 'No call matches providerCallId');
    }

    const updated = await deps.callsService.applyStatusTransition(call.id, body.status, {
      terminationReason: body.terminationReason,
      failureCode: body.failureCode,
      providerReportedCostMicros: body.providerReportedCostMicros,
      providerCurrency: body.providerCurrency,
    });

    return { ok: true, call: updated };
  });

  app.get(
    '/api/v1/telephony/twilio/token',
    { preHandler: deps.requireAuth as never },
    async (request) => {
      const twilio = deps.telephonyService.getTwilioAdapter();
      const runtime = deps.telephonyService.getRuntimeState();
      if (
        !runtime.enabled ||
        runtime.effectiveMode !== 'live' ||
        !twilio.isWebRtcConfigured()
      ) {
        return { webrtcEnabled: false };
      }

      const identity = `mococall_user_${request.authUser!.id}`;
      const token = await twilio.generateVoiceAccessToken(identity);
      return {
        webrtcEnabled: true,
        token,
        identity,
      };
    }
  );

  function buildTwilioWebhookUrl(requestUrl: string, headers: Record<string, unknown>): string {
    const base = deps.env.PUBLIC_API_BASE_URL
      ? deps.env.PUBLIC_API_BASE_URL.replace(/\/+$/, '')
      : `${(headers['x-forwarded-proto'] as string) || 'https'}://${headers.host as string}`;
    return `${base}${requestUrl}`;
  }

  function escapeXmlAttr(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  app.post('/api/v1/telephony/webhooks/twilio/status', async (request) => {
    if (!deps.env.TELEPHONY_ENABLED || !deps.env.TELEPHONY_COMPLIANCE_VERIFIED) {
      throw new AppError(
        503,
        'TELEPHONY_DISABLED',
        'Live Twilio webhooks are inactive while telephony is disabled'
      );
    }

    const params = (request.body ?? {}) as Record<string, string>;
    const signature =
      typeof request.headers['x-twilio-signature'] === 'string'
        ? request.headers['x-twilio-signature']
        : undefined;
    const twilio = deps.telephonyService.getTwilioAdapter();
    const webhookUrl = buildTwilioWebhookUrl(request.url, request.headers as Record<string, unknown>);

    if (!twilio.validateSignature(signature, webhookUrl, params)) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Twilio webhook signature');
    }

    const query = request.query as { callRecordId?: string };
    const callSid = params.CallSid;
    const call = query.callRecordId
      ? await deps.prisma.callRecord.findUnique({ where: { id: query.callRecordId } })
      : callSid
        ? await deps.prisma.callRecord.findUnique({ where: { providerCallId: callSid } })
        : null;

    if (!call) {
      throw new AppError(404, 'CALL_NOT_FOUND', 'No matching call record for Twilio callback');
    }

    if (callSid && call.providerCallId !== callSid && (!call.providerCallId || call.providerCallId.startsWith('webrtc_pending_'))) {
      await deps.prisma.callRecord.update({
        where: { id: call.id },
        data: { providerCallId: callSid },
      });
    }

    const mappedStatus = mapTwilioStatus(params.CallStatus);
    const parsedDuration = params.CallDuration ? Number.parseInt(params.CallDuration, 10) : undefined;
    const rawPrice = params.Price ? Math.abs(Number.parseFloat(params.Price)) : undefined;
    const providerReportedCostMicros =
      rawPrice !== undefined && Number.isFinite(rawPrice)
        ? Math.round(rawPrice * 1_000_000)
        : undefined;

    const updated = await deps.callsService.applyStatusTransition(call.id, mappedStatus, {
      terminationReason:
        mappedStatus === 'FAILED' ? `TWILIO_${(params.CallStatus || 'FAILED').toUpperCase()}` : undefined,
      failureCode: params.ErrorCode || undefined,
      providerReportedCostMicros,
      providerCurrency: params.PriceUnit || undefined,
      durationSecondsOverride:
        parsedDuration !== undefined && !Number.isNaN(parsedDuration) ? parsedDuration : undefined,
    });

    return { ok: true, call: updated };
  });

  app.post('/api/v1/telephony/webhooks/twilio/voice', async (request, reply) => {
    if (!deps.env.TELEPHONY_ENABLED || !deps.env.TELEPHONY_COMPLIANCE_VERIFIED) {
      return reply
        .type('application/xml')
        .send('<Response><Say>Telephony is disabled.</Say><Hangup/></Response>');
    }

    const params = (request.body ?? {}) as Record<string, string>;
    const signature =
      typeof request.headers['x-twilio-signature'] === 'string'
        ? request.headers['x-twilio-signature']
        : undefined;
    const twilio = deps.telephonyService.getTwilioAdapter();
    const webhookUrl = buildTwilioWebhookUrl(request.url, request.headers as Record<string, unknown>);

    if (!twilio.validateSignature(signature, webhookUrl, params)) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Twilio webhook signature');
    }

    const to = (params.To || '').trim();
    const from = (params.From || deps.env.TWILIO_CALLER_ID || '').trim();
    const callRecordId = (params.mococallRecordId || '').trim();
    const callSid = (params.CallSid || '').trim();

    if (callRecordId && callSid) {
      const existing = await deps.prisma.callRecord.findUnique({ where: { id: callRecordId } });
      if (existing) {
        await deps.prisma.callRecord.update({
          where: { id: existing.id },
          data: { providerCallId: callSid },
        });
      }
    }

    if (!to || !from) {
      return reply
        .type('application/xml')
        .send('<Response><Say>Missing destination or caller ID.</Say><Hangup/></Response>');
    }

    const statusUrl = callRecordId ? twilio.buildStatusCallbackUrl(callRecordId) : null;
    const statusAttr = statusUrl
      ? ` statusCallback="${escapeXmlAttr(statusUrl)}" statusCallbackEvent="initiated ringing answered completed"`
      : '';

    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response><Dial callerId="${escapeXmlAttr(from)}">` +
      `<Number${statusAttr}>${escapeXmlAttr(to)}</Number>` +
      `</Dial></Response>`;

    return reply.type('application/xml').send(twiml);
  });
}
