import { CommitMessageError, generateCommitMessage } from '../core/features/commit-message';

/**
 * Result of a POST /internal/commit-message request. The caller writes `status`
 * and the JSON-serialized `body` back to the HTTP response.
 */
export interface CommitMessageRouteResult {
  status: number;
  body: Record<string, unknown>;
}

const KNOWN_ERRORS = new Set<string>(Object.values(CommitMessageError));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * IDE → backend: write a commit message for the files in the commit dialog.
 *
 * Body: `{ workingDir, paths?: string[], draft?: string, model?: string }`, where
 * `paths` are the absolute paths of the changes included in the commit and
 * `draft` is what the message box already holds.
 *
 * Answers 200 `{ message, scope }`; 422 `{ error }` with a {@link CommitMessageError}
 * code when there is nothing to describe; 500 `{ error }` with the CLI's own
 * message when the model call fails. The IDE shows that text as is.
 */
export async function handleCommitMessageRequest(rawBody: string): Promise<CommitMessageRouteResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } };
  }
  if (!isRecord(parsed) || typeof parsed.workingDir !== 'string' || !parsed.workingDir) {
    return { status: 400, body: { error: 'workingDir is required' } };
  }

  const paths = Array.isArray(parsed.paths)
    ? parsed.paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
    : null;

  try {
    const { message, scope } = await generateCommitMessage({
      workingDir: parsed.workingDir,
      paths,
      draft: typeof parsed.draft === 'string' ? parsed.draft : null,
      model: typeof parsed.model === 'string' ? parsed.model : null,
    });
    return { status: 200, body: { message, scope } };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (KNOWN_ERRORS.has(text)) return { status: 422, body: { error: text } };
    console.error('[node-backend]', 'Failed to generate a commit message:', err);
    return { status: 500, body: { error: text } };
  }
}
