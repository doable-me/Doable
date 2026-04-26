export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface DeployDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onStatusChange?: (status: DeployStatus) => void;
}

export type DeployStatus = "idle" | "deploying" | "success" | "error";

export type Step = "configure" | "building" | "deploying" | "success" | "error";

export interface DeployResult {
  deploymentId: string;
  url: string;
  status: string;
  buildTimeMs?: number;
  deployTimeMs?: number;
  durationMs: number;
}

export interface DeployError {
  message: string;
  buildLog?: string;
  deploymentId?: string;
}

export interface DeploymentHistoryItem {
  id: string;
  environment: string;
  status: string;
  url: string | null;
  adapter: string;
  build_time_ms: number | null;
  deploy_time_ms: number | null;
  created_at: string;
}

export function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function getAuthToken(): string | null {
  return typeof window !== "undefined"
    ? localStorage.getItem("access_token")
    : null;
}
