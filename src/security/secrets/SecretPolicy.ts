export type SecretType =
  | 'api_key'
  | 'access_token'
  | 'private_key'
  | 'ssh_key'
  | 'jwt'
  | 'database_url'
  | 'cloud_credential'
  | 'env_value'
  | 'password'
  | 'webhook_secret'
  | 'oauth_secret'
  | 'session_secret'
  | 'email_address'
  | 'absolute_local_path'
  | 'private_repo_url';

export const HIGH_RISK_SECRETS: SecretType[] = ['api_key', 'access_token', 'private_key', 'ssh_key', 'cloud_credential', 'oauth_secret', 'database_url'];
