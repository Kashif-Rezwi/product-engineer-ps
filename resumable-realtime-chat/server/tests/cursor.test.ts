import { describe, it, expect } from 'vitest';
import { isValidStreamId } from '../src/lib/cursor.js';

// AC6: an invalid or stale cursor must be rejected up front with an explicit
// 400 instead of silently missing data. The controller relies on this check.
describe('isValidStreamId (resume cursor validation)', () => {
    it('accepts valid Redis stream entry IDs and the "from the start" cursor', () => {
        expect(isValidStreamId('0-0')).toBe(true);
        expect(isValidStreamId('1726123456789-0')).toBe(true);
        expect(isValidStreamId('1726123456789-12')).toBe(true);
        expect(isValidStreamId('1-0')).toBe(true);
    });

    it('rejects garbage, partial, and malformed cursors', () => {
        expect(isValidStreamId('garbage')).toBe(false);
        expect(isValidStreamId('')).toBe(false);
        expect(isValidStreamId('123')).toBe(false);
        expect(isValidStreamId('123-')).toBe(false);
        expect(isValidStreamId('-1-0')).toBe(false);
        expect(isValidStreamId('a-b')).toBe(false);
        expect(isValidStreamId('12-34-56')).toBe(false);
        expect(isValidStreamId('0')).toBe(false);
        expect(isValidStreamId('0-0-0')).toBe(false);
    });
});