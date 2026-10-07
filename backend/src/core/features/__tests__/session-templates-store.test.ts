import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionTemplateCollection } from '../../entities/session/SessionTemplate.collection';
import {
  deleteSessionTemplate,
  readSessionTemplates,
  saveSessionTemplate,
  SESSION_TEMPLATE_NAME_MAX,
} from '../session-templates-store';

describe('session-templates-store', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-session-templates-')));
    process.env.CCG_HOME = join(root, 'ccg');
  });

  afterEach(() => {
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(root, { recursive: true, force: true });
  });

  const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

  it('has no templates before anything is saved', async () => {
    expect(await readSessionTemplates()).toEqual([]);
  });

  it('saves a template and lists templates by name', async () => {
    await saveSessionTemplate({ name: 'review', model: 'opus', inputMode: 'plan', effort: 'high' });
    const { ok, templates } = await saveSessionTemplate({ name: 'Quick fix', model: 'sonnet', inputMode: 'acceptEdits', effort: null });

    expect(ok).toBe(true);
    expect(plain(templates).map((t: { name: string }) => t.name)).toEqual(['Quick fix', 'review']);
    expect(plain(templates)[1]).toEqual({
      name: 'review', model: 'opus', inputMode: 'plan', effort: 'high', updatedAt: expect.any(Number),
    });
  });

  it('stores a template as a row shared by every project, with no row number on the wire', async () => {
    const { templates } = await saveSessionTemplate({ name: 'review', model: 'opus' });

    const lines = readFileSync(new SessionTemplateCollection().filePath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: 1, projectId: null, name: 'review', model: 'opus', inputMode: null, effort: null });
    expect(plain(templates)[0]).not.toHaveProperty('id');
  });

  it('replaces the template of the same name instead of adding a second one', async () => {
    await saveSessionTemplate({ name: 'review', model: 'opus', inputMode: 'plan' });
    const { templates } = await saveSessionTemplate({ name: '  review ', model: 'sonnet', inputMode: null, effort: 'low' });

    expect(plain(templates)).toEqual([
      { name: 'review', model: 'sonnet', inputMode: null, effort: 'low', updatedAt: expect.any(Number) },
    ]);
  });

  it('refuses a missing, blank or overlong name, and a choice that is not a string', async () => {
    expect((await saveSessionTemplate({ name: '   ' })).error).toBe('name is required');
    expect((await saveSessionTemplate({})).ok).toBe(false);
    expect((await saveSessionTemplate({ name: 'x'.repeat(SESSION_TEMPLATE_NAME_MAX + 1) })).ok).toBe(false);
    expect((await saveSessionTemplate({ name: 'n', model: 42 })).ok).toBe(false);
    expect(await readSessionTemplates()).toEqual([]);
  });

  it('deletes by name, and deleting one that is not there changes nothing', async () => {
    await saveSessionTemplate({ name: 'a', model: 'opus' });
    await saveSessionTemplate({ name: 'b', model: 'sonnet' });

    expect(plain((await deleteSessionTemplate('a')).templates).map((t: { name: string }) => t.name)).toEqual(['b']);
    const { ok, templates } = await deleteSessionTemplate('missing');
    expect(ok).toBe(true);
    expect(templates).toHaveLength(1);
  });
});
