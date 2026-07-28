import type { LucideIcon } from "lucide-react";

export type ModuleStatus =
  | "LIVE"
  | "IN_DEVELOPMENT"
  | "AWAITING_INTEGRATION";

export interface RouteDefinition {
  path: string;
  legacyHash: string;
  title: string;
  section: string;
  description: string;
  icon: LucideIcon;
  phase: 1 | 2 | 3 | 4 | 5;
  permission?: string;
  api?: string;
  status: ModuleStatus;
  statusLabel?: string;
  plannedCapabilities?: string[];
  dependency?: string;
  targetMilestone?: string;
  backPath?: string;
  hidden?: boolean;
}

export interface NavigationGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  routes: RouteDefinition[];
}
