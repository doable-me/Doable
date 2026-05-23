"use client";

import { SectionCard } from "@/modules/settings/components/project-settings-shared";

export function DangerPane() {
  return (
    <SectionCard title="Danger Zone" description="Destructive database operations. These cannot be undone.">
      <p className="text-sm text-muted-foreground">Coming soon.</p>
    </SectionCard>
  );
}
