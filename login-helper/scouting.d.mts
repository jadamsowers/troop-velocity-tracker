export interface AuthenticateResult {
  status: number;
  body: {
    token?: string;
    units?: Array<{ guid: string; name: string }>;
    error?: string;
    code?: unknown;
  };
}

export function authenticate(credentials: {
  username: unknown;
  password: unknown;
}): Promise<AuthenticateResult>;
