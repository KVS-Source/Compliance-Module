import type { LucideIcon } from "lucide-react";

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
}

export interface NavigationGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  routes: RouteDefinition[];
}
