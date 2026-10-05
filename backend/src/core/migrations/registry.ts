import { MigrationEntry, MigrationRegistry } from '../entities/migration/MigrationRegistry';
import CreateProjects from './20261004120000_create-projects';
import ImportLegacyProjectsJson from './20261004120100_import-legacy-projects-json';
import ImportLegacyPrompts from './20261004120200_import-legacy-prompts';
import ImportLegacySessionFavorites from './20261005120000_import-legacy-session-favorites';
import ImportLegacySessionAiTitles from './20261005120100_import-legacy-session-ai-titles';

/**
 * Every migration of this version, in the order they run.
 *
 * To add one: write the file in this folder, import it here, and add a line at the
 * end. The test next to this file fails when the folder and this list disagree, so
 * a migration that was written but not listed cannot ship unnoticed.
 */
export const MIGRATIONS = new MigrationRegistry([
  new MigrationEntry('20261004120000_create-projects', () => new CreateProjects()),
  new MigrationEntry('20261004120100_import-legacy-projects-json', () => new ImportLegacyProjectsJson()),
  new MigrationEntry('20261004120200_import-legacy-prompts', () => new ImportLegacyPrompts()),
  new MigrationEntry('20261005120000_import-legacy-session-favorites', () => new ImportLegacySessionFavorites()),
  new MigrationEntry('20261005120100_import-legacy-session-ai-titles', () => new ImportLegacySessionAiTitles()),
]);
