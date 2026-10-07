import { useMemo } from 'react';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useFableProbe } from '@/contexts/FableProbeContext';
import { modelChangeLabel } from '@/pages/ChatPage/modelChangeLabel';
import { DEFAULT_MODEL_ALIAS, resolveModelInfo, toModelAlias, withFableFallback } from '@/types/models';
import type { ModelInfo } from '@/types/slashCommand';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useVersionInfo } from '@/hooks/useVersionInfo';

/**
 * Last-resort label when `current` can't be matched to any list item — e.g.
 * the CLI reported a model family the selectable list doesn't carry. Humanize
 * the coarse alias ("opus" → "Opus") so the indicator stays meaningful instead
 * of vanishing; fall back to the raw value if even the family is unknown.
 *
 * Showing the raw value is deliberate: a model we can't identify must not be
 * dressed up as "Default", which would claim something we don't know to be
 * true (issue #217).
 */
export function fallbackModelLabel(current: string): string {
  const alias = toModelAlias(current);
  if (alias === DEFAULT_MODEL_ALIAS) return current;
  return alias.charAt(0).toUpperCase() + alias.slice(1);
}

/**
 * The current model as the composer's model chip names it, for every place that
 * has to say the same name: the chip itself, and the IDE status bar's tooltip.
 *
 * `models` is empty until the CLI's config arrives, and `label` is null until
 * then: nothing meaningful can be said about the model before it does.
 * `info` is the selectable row the current model resolves to, or null for a
 * model the list does not carry (shown under `fallbackModelLabel`).
 */
export function useCurrentModelLabel(): {
  models: ModelInfo[];
  currentModel: string;
  info: ModelInfo | null;
  label: string | null;
} {
  const { controlResponse } = useCliConfig();
  const currentModel = useCurrentModel();
  const { cliVersion } = useVersionInfo();
  const { probedAvailable, probedCanonicalModel } = useFableProbe();

  // Memoized on the CLI response so the fallback-augmented array keeps a stable
  // reference across renders (the chip's rotate effect depends on `models`).
  const models: ModelInfo[] = useMemo(
    () => withFableFallback(controlResponse?.response?.response?.models ?? [], cliVersion, probedAvailable, probedCanonicalModel),
    [controlResponse, cliVersion, probedAvailable],
  );

  if (models.length === 0) return { models, currentModel, info: null, label: null };
  // No default fallback here: an unidentified model must show as itself, not
  // masquerade as "Default" (issue #217).
  const info = resolveModelInfo(models, currentModel, { allowDefaultFallback: false }) ?? null;
  return { models, currentModel, info, label: info ? modelChangeLabel(info) : fallbackModelLabel(currentModel) };
}
