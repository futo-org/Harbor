import { publicEnv } from '@/src/common/util/env';
import {
  type Attributes,
  SpanStatusCode,
  type Tracer,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  type Resource,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  type SpanExporter,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_ERROR_TYPE,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DEVICE_MODEL_IDENTIFIER,
  ATTR_OS_NAME,
  ATTR_OS_VERSION,
} from '@opentelemetry/semantic-conventions/incubating';
import type { ErrorEntry } from '../hooks/useErrorQueue';
import type { LogEntry } from '../hooks/useLogStore';
import {
  identityAttributes,
  onTelemetryIdentityChange,
  telemetryAuthToken,
} from './identity';
import { type Diagnostics, collectDiagnostics } from './diagnostics';

/** Base URL of the otlp service; also the audience of the auth token. */
export const OTLP_URL = publicEnv(
  'EXPO_PUBLIC_HARBOR_OTLP_URL',
  process.env.EXPO_PUBLIC_HARBOR_OTLP_URL,
)?.replace(/\/+$/, '');

const EXPORT_TIMEOUT_MS = 10_000;
export const MAX_FEEDBACK_LOG_LINES = 500;
const FLUSH_TIMEOUT_MS = 3_000;

export function createResource(
  diagnostics: Diagnostics,
  identity: Attributes = {},
): Resource {
  const attributes: Record<string, string | null> = {
    [ATTR_SERVICE_NAME]: 'harbor',
    [ATTR_SERVICE_VERSION]: diagnostics.build
      ? `${diagnostics.version}+${diagnostics.build}`
      : diagnostics.version,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: diagnostics.variant,
    [ATTR_OS_NAME]: diagnostics.platform,
    [ATTR_OS_VERSION]: diagnostics.osVersion,
    [ATTR_DEVICE_MODEL_IDENTIFIER]: diagnostics.device,
    'harbor.app_id': diagnostics.app,
  };
  return resourceFromAttributes({
    ...Object.fromEntries(
      Object.entries(attributes).filter(([, value]) => value != null),
    ),
    ...identity,
  });
}

export function createTracerProvider(
  exporter: SpanExporter,
  diagnostics: Diagnostics = collectDiagnostics(),
  identity: Attributes = {},
): TracerProvider {
  return new TracerProvider({
    resource: createResource(diagnostics, identity),
    spanLimits: { eventCountLimit: MAX_FEEDBACK_LOG_LINES },
    spanProcessors: [new BatchSpanProcessor({ exporter })],
  });
}

let provider: TracerProvider | null = null;

export function isTracingConfigured(): boolean {
  return !!OTLP_URL;
}

function getProvider(): TracerProvider | null {
  if (!OTLP_URL) return null;
  const otlpUrl = OTLP_URL;
  provider ??= createTracerProvider(
    new OTLPTraceExporter({
      url: `${otlpUrl}/v1/traces`,
      timeoutMillis: EXPORT_TIMEOUT_MS,
      headers: async () => {
        const headers: Record<string, string> = {};
        const token = await telemetryAuthToken(otlpUrl);
        if (token) headers.authorization = `Bearer ${token}`;
        return headers;
      },
    }),
    collectDiagnostics(),
    identityAttributes(),
  );
  return provider;
}

onTelemetryIdentityChange(() => {
  const previous = provider;
  provider = null;
  void previous?.shutdown().catch(() => {});
});

export function getTracer(name = 'harbor'): Tracer | null {
  return getProvider()?.getTracer(name) ?? null;
}

export function recordErrorSpan(tracer: Tracer, entry: ErrorEntry): void {
  const span = tracer.startSpan('app.error', {
    startTime: entry.at,
    attributes: {
      [ATTR_ERROR_TYPE]: entry.name,
      'harbor.error.fatal': entry.fatal,
      'harbor.error.id': entry.id,
    },
  });
  span.recordException(
    { name: entry.name, message: entry.message, stack: entry.stack },
    entry.at,
  );
  span.setStatus({ code: SpanStatusCode.ERROR, message: entry.message });
  span.end(entry.at);
}

export interface Feedback {
  message: string;
  email?: string;
  identityKey?: string;
  signingKey?: string;
  logs?: LogEntry[];
}

export function recordFeedbackSpan(tracer: Tracer, feedback: Feedback): void {
  const now = Date.now();
  const span = tracer.startSpan('app.feedback', {
    startTime: now,
    attributes: {
      'harbor.feedback.message': feedback.message,
      ...(feedback.email ? { 'harbor.feedback.email': feedback.email } : {}),
      ...identityAttributes({
        identityKey: feedback.identityKey ?? null,
        signingKey: feedback.signingKey ?? null,
      }),
      'harbor.feedback.log_count': feedback.logs?.length ?? 0,
    },
  });
  for (const entry of feedback.logs ?? []) {
    span.addEvent(
      'log',
      { 'log.severity': entry.level, 'log.message': entry.message },
      entry.at,
    );
  }
  span.end(now);
}

export async function flushTraces(
  timeoutMs = FLUSH_TIMEOUT_MS,
): Promise<boolean> {
  const active = provider;
  if (!active) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([active.forceFlush().then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
