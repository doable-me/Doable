"use client";

import { SectionCard } from "@/modules/settings/components/project-settings-shared";

export function MigrationsPane() {
  return (
    <SectionCard title="Migrations" description="Applied migration history for your database.">
      <p className="text-sm text-muted-foreground">Coming soon.</p>
    </SectionCard>
  );
}
