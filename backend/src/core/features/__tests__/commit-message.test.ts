import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../claude-print', () => ({
  runClaudePrint: vi.fn(),
}));

import { runClaudePrint } from '../claude-print';
import {
  buildCommitMessageRequest,
  cleanCommitMessage,
  collectCommitChanges,
  COMMIT_SYSTEM_PROMPT,
  CommitMessageError,
  fitDiff,
  generateCommitMessage,
  MIN_FILE_DIFF_CHARS,
  recentSubjects,
  toRepoPaths,
} from '../commit-message';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

let repo: string;

function write(rel: string, text: string): void {
  const file = join(repo, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
}

function initRepo(): void {
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'config', 'commit.gpgsign', 'false');
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'ccg-commit-'));
  vi.mocked(runClaudePrint).mockReset();
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('toRepoPaths', () => {
  it('makes paths relative to the root, drops outside ones and duplicates', () => {
    expect(toRepoPaths('/r', ['/r/a.ts', '/r/src/b.ts', '/elsewhere/c.ts', '/r/a.ts', '/r'])).toEqual(['a.ts', 'src/b.ts']);
  });
});

describe('fitDiff', () => {
  const block = (name: string, size: number) => `diff --git a/${name} b/${name}\n${'x'.repeat(size)}\n`;

  it('leaves a short diff alone', () => {
    const diff = block('a', 10);
    expect(fitDiff(diff, 1000)).toBe(diff);
  });

  it('cuts each file so a big one does not crowd out the rest', () => {
    const diff = block('package-lock.json', 50_000) + block('src/app.ts', 200);
    const out = fitDiff(diff, 10_000);
    expect(out.length).toBeLessThan(12_000);
    expect(out).toContain('diff --git a/src/app.ts');
    expect(out).toContain("more characters of this file's diff left out");
  });

  it('names how many files did not fit at all', () => {
    const diff = Array.from({ length: 20 }, (_, i) => block(`f${i}`, MIN_FILE_DIFF_CHARS * 2)).join('');
    const out = fitDiff(diff, MIN_FILE_DIFF_CHARS * 5);
    expect(out).toMatch(/more files left out/);
  });
});

describe('cleanCommitMessage', () => {
  it('takes the tagged message', () => {
    expect(cleanCommitMessage('Sure.\n<commit>\nfix: x\n\n- y\n</commit>\nDone')).toBe('fix: x\n\n- y');
  });

  it('falls back to a fence, then to the whole answer', () => {
    expect(cleanCommitMessage('```\nAdd x\n```')).toBe('Add x');
    expect(cleanCommitMessage('  Add x  ')).toBe('Add x');
  });

  it('turns literal \\n into lines and collapses blank runs', () => {
    expect(cleanCommitMessage('<commit>Add x\\n\\n- y</commit>')).toBe('Add x\n\n- y');
    expect(cleanCommitMessage('<commit>Add x\n\n\n\n- y</commit>')).toBe('Add x\n\n- y');
  });
});

describe('buildCommitMessageRequest', () => {
  it('puts style, draft, stat and diff in labelled blocks', () => {
    const request = buildCommitMessageRequest({
      changes: { gitRoot: '/r', scope: 'selected', stat: 'a | 1 +', diff: 'diff --git a/a b/a', newFiles: [] },
      subjects: ['feat: one', 'fix: two'],
      draft: 'wip login',
    });
    expect(request).toContain('<recent-subjects>\nfeat: one\nfix: two\n</recent-subjects>');
    expect(request).toContain('<draft-message>\nwip login\n</draft-message>');
    expect(request).toContain('<stat>\na | 1 +\n</stat>');
    expect(request).toContain('<diff>\ndiff --git a/a b/a\n</diff>');
  });

  it('leaves out what is not there', () => {
    const request = buildCommitMessageRequest({
      changes: { gitRoot: '/r', scope: 'all', stat: '', diff: 'd', newFiles: [] },
      subjects: [],
    });
    expect(request).toBe('<diff>\nd\n</diff>');
  });
});

describe('collectCommitChanges', () => {
  it('refuses a folder that is not a repository', async () => {
    await expect(collectCommitChanges(repo)).rejects.toThrow(CommitMessageError.NotARepository);
  });

  it('describes exactly the files named, against HEAD, with new files as content', async () => {
    initRepo();
    write('a.txt', 'one\n');
    write('b.txt', 'two\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    write('a.txt', 'one changed\n');
    write('b.txt', 'two changed\n');
    write('dir with space/new.txt', 'hello\nworld\n');

    const changes = await collectCommitChanges(repo, [join(repo, 'a.txt'), join(repo, 'dir with space/new.txt')]);
    expect(changes.scope).toBe('selected');
    expect(changes.diff).toContain('one changed');
    expect(changes.diff).not.toContain('two changed');
    expect(changes.newFiles).toEqual(['dir with space/new.txt']);
    expect(changes.diff).toContain('new file: dir with space/new.txt\n+hello\n+world\n');
    expect(changes.stat).toContain('a.txt');
  });

  it('includes staged changes in a selected file even when the working tree matches the index', async () => {
    initRepo();
    write('a.txt', 'one\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    write('a.txt', 'staged\n');
    git(repo, 'add', 'a.txt');

    const changes = await collectCommitChanges(repo, [join(repo, 'a.txt')]);
    expect(changes.diff).toContain('+staged');
  });

  it('without paths, takes the staged changes when there are some', async () => {
    initRepo();
    write('a.txt', 'one\n');
    write('b.txt', 'two\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    write('a.txt', 'staged\n');
    git(repo, 'add', 'a.txt');
    write('b.txt', 'unstaged\n');
    write('c.txt', 'untracked\n');

    const changes = await collectCommitChanges(repo);
    expect(changes.scope).toBe('staged');
    expect(changes.diff).toContain('+staged');
    expect(changes.diff).not.toContain('unstaged');
    expect(changes.newFiles).toEqual([]);
  });

  it('without paths and nothing staged, takes everything, untracked files too', async () => {
    initRepo();
    write('a.txt', 'one\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    write('a.txt', 'changed\n');
    write('c.txt', 'untracked\n');

    const changes = await collectCommitChanges(repo);
    expect(changes.scope).toBe('all');
    expect(changes.diff).toContain('+changed');
    expect(changes.newFiles).toEqual(['c.txt']);
  });

  it('works before the first commit', async () => {
    initRepo();
    write('a.txt', 'first\n');
    git(repo, 'add', 'a.txt');
    write('b.txt', 'loose\n');

    const changes = await collectCommitChanges(repo, [join(repo, 'a.txt'), join(repo, 'b.txt')]);
    expect(changes.diff).toContain('+first');
    expect(changes.newFiles).toEqual(['b.txt']);
  });

  it('says so when there is nothing to commit', async () => {
    initRepo();
    write('a.txt', 'one\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    await expect(collectCommitChanges(repo)).rejects.toThrow(CommitMessageError.NoChanges);
    await expect(collectCommitChanges(repo, ['/somewhere/else.txt'])).rejects.toThrow(CommitMessageError.NoChanges);
  });

  it('describes files from several repositories in a project that is not one itself', async () => {
    const project = repo;
    for (const name of ['api', 'web']) {
      const root = join(project, name);
      mkdirSync(root);
      git(root, 'init', '-q');
      git(root, 'config', 'user.email', 't@example.com');
      git(root, 'config', 'user.name', 'T');
      git(root, 'config', 'commit.gpgsign', 'false');
      writeFileSync(join(root, 'main.txt'), `${name} one\n`);
      git(root, 'add', '.');
      git(root, 'commit', '-qm', `init ${name}`);
      writeFileSync(join(root, 'main.txt'), `${name} two\n`);
    }
    writeFileSync(join(project, 'web', 'extra.txt'), 'new\n');

    const changes = await collectCommitChanges(project, [
      join(project, 'api', 'main.txt'),
      join(project, 'web', 'main.txt'),
      join(project, 'web', 'extra.txt'),
    ]);
    // web has more files, so it leads and its history sets the style.
    expect(changes.gitRoot).toBe(join(project, 'web'));
    expect(changes.diff).toContain('# repository: web');
    expect(changes.diff).toContain('# repository: api');
    expect(changes.diff).toContain('+api two');
    expect(changes.diff).toContain('+web two');
    expect(changes.newFiles).toEqual(['extra.txt']);
  });

  it('finds the repository of a deleted file whose folder is gone too', async () => {
    initRepo();
    write('gone/old.txt', 'bye\n');
    write('keep.txt', 'k\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    rmSync(join(repo, 'gone'), { recursive: true });

    const changes = await collectCommitChanges(repo, [join(repo, 'gone', 'old.txt')]);
    expect(changes.diff).toContain('deleted file mode');
    expect(changes.diff).toContain('-bye');
  });

  it('follows a project opened through a symlink, as git reports the real path', async () => {
    initRepo();
    write('a.txt', 'one\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    write('a.txt', 'two\n');
    const linkParent = mkdtempSync(join(tmpdir(), 'ccg-link-'));
    const link = join(linkParent, 'project');
    symlinkSync(repo, link, 'dir');
    try {
      const changes = await collectCommitChanges(link, [join(link, 'a.txt')]);
      expect(changes.diff).toContain('+two');
    } finally {
      rmSync(linkParent, { recursive: true, force: true });
    }
  });

  it('calls a project with no repository at all not a repository', async () => {
    write('a.txt', 'x\n');
    await expect(collectCommitChanges(repo, [join(repo, 'a.txt')])).rejects.toThrow(CommitMessageError.NotARepository);
  });

  it('marks a binary new file instead of pasting it', async () => {
    initRepo();
    write('a.txt', 'one\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    writeFileSync(join(repo, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01]));
    const changes = await collectCommitChanges(repo, [join(repo, 'logo.png')]);
    expect(changes.diff).toContain('new file: logo.png (binary, 4 bytes)');
  });
});

describe('recentSubjects', () => {
  it('lists subjects newest first and skips merges', async () => {
    initRepo();
    write('a.txt', '1\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'feat: first');
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'fix: second');
    expect(await recentSubjects(repo)).toEqual(['fix: second', 'feat: first']);
  });

  it('is empty before the first commit', async () => {
    initRepo();
    expect(await recentSubjects(repo)).toEqual([]);
  });
});

describe('generateCommitMessage', () => {
  it('sends the changes and the style to the model and cleans the answer', async () => {
    initRepo();
    write('a.txt', 'one\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'feat: add a');
    write('a.txt', 'two\n');
    vi.mocked(runClaudePrint).mockResolvedValue('<commit>fix: change a</commit>');

    const result = await generateCommitMessage({ workingDir: repo, paths: [join(repo, 'a.txt')], model: 'haiku', draft: 'a' });

    expect(result).toEqual({ message: 'fix: change a', scope: 'selected' });
    const call = vi.mocked(runClaudePrint).mock.calls[0]![0];
    expect(call.systemPrompt).toBe(COMMIT_SYSTEM_PROMPT);
    expect(call.model).toBe('haiku');
    expect(call.workingDir).toBe(repo);
    expect(call.prompt).toContain('feat: add a');
    expect(call.prompt).toContain('+two');
    expect(call.prompt).toContain('<draft-message>\na\n</draft-message>');
  });

  it('reports an answer with nothing in it', async () => {
    initRepo();
    write('a.txt', 'one\n');
    vi.mocked(runClaudePrint).mockResolvedValue('<commit>  </commit>');
    await expect(generateCommitMessage({ workingDir: repo })).rejects.toThrow(CommitMessageError.EmptyResult);
  });
});
