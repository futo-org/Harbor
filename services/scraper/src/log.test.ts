import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createLogger, formatJson, hostOf, serializeFields } from './log.js';

describe('log', () => {
  test('json lines carry the tracing-style envelope and flattened fields', () => {
    const line = JSON.parse(
      formatJson('INFO', 'access', 'request', { status: 200, latency_ms: 12 }),
    );
    assert.equal(line.level, 'INFO');
    assert.equal(line.target, 'access');
    assert.equal(line.message, 'request');
    assert.equal(line.status, 200);
    assert.equal(line.latency_ms, 12);
    assert.ok(!Number.isNaN(Date.parse(line.timestamp)));
  });

  test('errors serialize to their message (+ type when subclassed)', () => {
    class Boom extends Error {
      name = 'Boom';
    }
    assert.deepEqual(serializeFields({ error: new Error('x') }), {
      error: 'x',
    });
    assert.deepEqual(
      serializeFields({ error: new Boom('y'), skip: undefined }),
      {
        error: 'y',
        error_type: 'Boom',
      },
    );
  });

  test('respects the minimum level', () => {
    const lines: string[] = [];
    const logger = createLogger({
      format: 'json',
      minLevel: 'WARN',
      sink: (l) => lines.push(l),
    });
    logger.info('t', 'dropped');
    logger.warn('t', 'kept');
    logger.error('t', 'kept too');
    assert.equal(lines.length, 2);
  });

  test('hostOf tolerates garbage', () => {
    assert.equal(hostOf('https://a.example/x'), 'a.example');
    assert.equal(hostOf('nope'), 'invalid');
  });
});
