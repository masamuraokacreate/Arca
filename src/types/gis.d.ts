/**
 * Google Identity Services (GIS) の型定義
 * https://developers.google.com/identity/oauth2/web/reference/js-reference
 */
interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (tokenResponse: TokenResponse) => void;
  error_callback?: (error: { type: string; message?: string }) => void;
}

interface TokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void;
}

interface CodeResponse {
  code: string;
  scope?: string;
  authuser?: string;
  prompt?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode?: "popup" | "redirect";
  redirect_uri?: string;
  access_type?: "offline" | "online";
  prompt?: string;
  include_granted_scopes?: boolean;
  enable_serial_consent?: boolean;
  hint?: string;
  hosted_domain?: string;
  callback: (codeResponse: CodeResponse) => void;
  error_callback?: (error: { type: string; message?: string }) => void;
}

interface CodeClient {
  requestCode(): void;
}

interface Google {
  accounts: {
    oauth2: {
      initTokenClient(config: TokenClientConfig): TokenClient;
      initCodeClient(config: CodeClientConfig): CodeClient;
      revoke(token: string, callback?: () => void): void;
    };
  };
}

declare const google: Google;
