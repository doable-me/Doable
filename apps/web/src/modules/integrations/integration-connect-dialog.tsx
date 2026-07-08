"use client";

import { useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConnectFlow } from "@/modules/integrations/connect-flow";
import {
  useIntegrationCatalog,
  type CatalogItem,
} from "@/modules/integrations/use-integration-catalog";

/**
 * In-editor "Connect <integration>" modal shown when the AI calls
 * request_integration for a service that isn't connected yet (e.g. ElevenLabs).
 *
 * Mirrors the Supabase provision dialog's UX: the user enters credentials
 * (API key / region / etc.) and connects WITHOUT leaving the editor. On
 * success the chat turn is re-prompted so the AI keeps building.
 *
 * It reuses the EXACT same <ConnectFlow> modal + `/integrations/connect`
 * endpoint the workspace-settings integrations panel uses, so field rendering
 * (from the registry `customAuthFields` — for ElevenLabs a Region dropdown +
 * API Key secret), credential shape, validation, and the dev-server restart
 * are all identical to the proven settings flow.
 */
export function IntegrationConnectDialog({
  request,
  workspaceId,
  projectId,
  onDismiss,
  onConnected,
}: {
  request: { integrationId: string; displayName: string; logoUrl?: string; reason: string };
  workspaceId: string;
  projectId?: string;
  onDismiss: () => void;
  onConnected: () => void;
}) {
  const { catalog, loading, connect, getAuthorizationUrl, getEnhancedAuthUrl } =
    useIntegrationCatalog(workspaceId);

  // Flips to true only once a real connect succeeds, so onOpenChange(false)
  // can distinguish "connected → re-prompt the AI" from "cancelled → dismiss".
  const connectedRef = useRef(false);

  // Resolve the catalog entry for the requested integration so ConnectFlow
  // renders its real customAuthFields (ElevenLabs → Region dropdown + API Key
  // secret). The catalog contains every registered integration, so any valid
  // integrationId resolves once the catalog has loaded.
  const item = useMemo<CatalogItem | null>(
    () => catalog.find((i) => i.id === request.integrationId) ?? null,
    [catalog, request.integrationId],
  );

  // Catalog is still fetching and the item hasn't resolved yet — show a
  // spinner so the popup appears IMMEDIATELY when the SSE event lands, instead
  // of a silent no-op while the catalog request is in flight.
  if (!item && loading) {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) onDismiss(); }}>
        <DialogContent>
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Connecting {request.displayName}…
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Catalog loaded but this integration isn't exposed to the workspace
  // (workspace_enabled_integrations / platform_enabled_integrations gating).
  // Tell the user instead of rendering an invisible no-op.
  if (!item) {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) onDismiss(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {request.displayName}</DialogTitle>
            <DialogDescription className="mt-1">
              {request.displayName} isn’t enabled for this workspace yet. Ask a
              workspace admin to enable it under Settings → Integrations, then
              try again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onDismiss}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ConnectFlow
      item={item}
      open
      onOpenChange={(open) => {
        if (open) return;
        if (connectedRef.current) onConnected();
        else onDismiss();
      }}
      onConnect={async (integrationId, data) => {
        // Store at project scope (like Supabase) so it's wired into this
        // project; fall back to user scope when there's no project context.
        const res = await connect(integrationId, {
          ...data,
          scope: projectId ? "project" : "user",
          projectId,
        });
        connectedRef.current = true;
        return res;
      }}
      onGetAuthorizationUrl={getAuthorizationUrl}
      onGetEnhancedAuthUrl={getEnhancedAuthUrl}
      projectId={projectId}
    />
  );
}
