// A resume cursor is a Redis stream entry ID ("<millis>-<seq>") or '0-0' (replay
// from the first event); invalid cursors get an explicit 400, not missing data (AC6).
export function isValidStreamId(id: string): boolean {
    return id === '0-0' || /^\d+-\d+$/.test(id);
}
