import { describe, expect, it } from 'vitest';
import { CORRELATION_HEADER, correlationFrom, newCorrelationId } from './correlation.js';
import { isCorrelationId } from '@tania/types';

describe('correlation', () => {
  it('generates valid ids', () => {
    expect(isCorrelationId(newCorrelationId())).toBe(true);
  });

  it('continues a well-formed inbound id from a Headers object', () => {
    const id = newCorrelationId();
    const headers = new Headers({ [CORRELATION_HEADER]: id });

    expect(correlationFrom(headers)).toBe(id);
  });

  it('continues a well-formed inbound id from a plain header record', () => {
    const id = newCorrelationId();
    expect(correlationFrom({ [CORRELATION_HEADER]: id })).toBe(id);
    expect(correlationFrom({ [CORRELATION_HEADER]: [id] })).toBe(id);
  });

  it('starts a fresh id when the inbound value is not a uuid', () => {
    const generated = correlationFrom({ [CORRELATION_HEADER]: 'drop table logs' });

    expect(generated).not.toBe('drop table logs');
    expect(isCorrelationId(generated)).toBe(true);
  });

  it('starts a fresh id when the header is absent', () => {
    expect(isCorrelationId(correlationFrom({}))).toBe(true);
  });
});
