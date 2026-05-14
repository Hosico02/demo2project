export type MarketResearchDomain =
  | 'web_ui_app'
  | 'social_deduction_game'
  | 'saas_app'
  | 'api_service'
  | 'cli_tool'
  | 'game'
  | 'generic_product';

export type CapabilityImportance = 'required' | 'recommended' | 'optional' | 'out_of_scope';
export type ResearchConfidence = 'high' | 'medium' | 'low';

export interface MarketResearchSource {
  title: string;
  url: string;
  retrieved_at: string;
  snippet: string;
}

export interface MarketResearchCapability {
  id: string;
  label: string;
  description: string;
  importance: CapabilityImportance;
  source_urls: string[];
  local_evidence_patterns: string[];
}

export interface MarketResearchReport {
  schema_version: 1;
  generated_at: string;
  project_path: string;
  domain: MarketResearchDomain;
  query: string;
  search_provider: string;
  copy_policy: string;
  sources: MarketResearchSource[];
  capabilities: MarketResearchCapability[];
  risks: string[];
  confidence: ResearchConfidence;
}
