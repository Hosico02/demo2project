import {
  OfficialModelCatalogNetworkDeniedError,
  refreshOfficialModelCatalog,
  writeOfficialModelCatalog,
} from '../../research/OfficialModelCatalog.js';
import { requireProject } from './_shared.js';

export async function modelsRefreshCmd(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const allowNetwork = flags.web === true || flags.web === 'true';
  if (!allowNetwork) {
    process.stderr.write('error: model catalog networking is disabled by default; pass --web to read official provider docs\n');
    return 2;
  }

  try {
    const catalog = await refreshOfficialModelCatalog({
      projectPath: project,
      systemRoot: project,
      allowNetwork,
    });
    await writeOfficialModelCatalog(project, catalog);
    process.stdout.write(JSON.stringify({
      ok: true,
      provider_count: catalog.providers.length,
      refreshed_provider_count: catalog.providers.filter((provider) => provider.source_kind === 'live_official_docs').length,
      catalog: '.demo2project/research/llm-model-catalog.json',
      warnings: catalog.warnings,
      providers: catalog.providers.map((provider) => ({
        id: provider.id,
        default_model: provider.default_model,
        model_count: provider.models.length,
        source_url: provider.source_url,
        source_kind: provider.source_kind,
      })),
    }, null, 2) + '\n');
    return 0;
  } catch (err) {
    if (err instanceof OfficialModelCatalogNetworkDeniedError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(`error: model catalog refresh failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
