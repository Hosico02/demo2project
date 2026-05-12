import { describe, it, expect } from 'vitest';
import { FAILURE_CATEGORIES, listAll, explain, categorize } from '../src/core/failureTaxonomy.js';

describe('FailureTaxonomy', () => {
  it('has the expected number of categories', () => {
    expect(FAILURE_CATEGORIES.length).toBeGreaterThanOrEqual(30);
  });
  it('every category has a description', () => {
    for (const c of FAILURE_CATEGORIES) expect(explain(c).length).toBeGreaterThan(10);
  });
  it('listAll groups by bucket', () => {
    const r = listAll();
    expect(r.length).toBe(FAILURE_CATEGORIES.length);
  });
  it('categorize() finds a known shape from free text', () => {
    expect(categorize('Found AKIAEXAMPLEFAKE12345678 in source')).toBe('safety_failure/secret_leak');
    expect(categorize('rm -rf /etc')).toBe('safety_failure/unsafe_command');
    expect(categorize('Random gibberish')).toBeNull();
  });
});
