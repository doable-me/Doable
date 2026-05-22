import type {
  SelectedElement,
  VisualEditMode,
} from "@/modules/editor/visual-edit/types";

export interface DesignPanelProps {
  projectId: string;
  onClose: () => void;
  onSendMessage: (message: string) => void;
  // Visual edit integration (passed from parent editor page)
  mode: VisualEditMode;
  selectedElement: SelectedElement | null;
  onActivate: () => void;
  onDeactivate: () => void;
  onSelectParent: () => void;
  onDeselectElement: () => void;
  // Live DOM editing
  onApplyLiveStyle: (property: string, value: string) => void;
  onApplyLiveText: (text: string) => void;
  hasPendingChanges: boolean;
  onCommitChanges: () => void;
  onDiscardChanges: () => void;
  onDirectSave: () => Promise<boolean>;
  isSaving: boolean;
}
