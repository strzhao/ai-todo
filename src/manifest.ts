import { API_BASE_URL } from "./config.js";

export interface ManifestParam {
  name: string;
  in: "query" | "body" | "path";
  type: string;
  required: boolean;
  enum?: (string | number)[];
  description?: string;
}

export interface ManifestOperation {
  id: string;
  name: string;
  description: string;
  method: string;
  path: string;
  params: ManifestParam[];
  fixed_body?: Record<string, unknown>;
  format?: "text" | "json";
}

export interface Manifest {
  version: string;
  base_url: string;
  auth: {
    type: string;
    authorize_url: string;
    service_id: string;
    cli_auth_path: string;
  };
  operations: ManifestOperation[];
}

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(`${API_BASE_URL}/api/manifest`);
  if (!res.ok) {
    console.log(JSON.stringify({ error: "Failed to fetch manifest", status: res.status }));
    process.exit(1);
  }
  return res.json() as Promise<Manifest>;
}
