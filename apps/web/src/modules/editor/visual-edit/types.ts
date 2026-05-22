// ─── Visual Edit Module Types ────────────────────────────────

export interface SourceLocation {
  file: string;
  line: number;
  col: number;
}

export interface SelectedElement {
  tagName: string;
  className: string;
  textContent: string;
  selector: string;
  boundingRect: ElementRect;
  computedStyles: ComputedElementStyles;
  isTextElement: boolean;
  isIconElement: boolean;
  hasChildren: boolean;
  childCount: number;
  sourceLocation: SourceLocation | null;
}

export interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export interface ComputedElementStyles {
  // Colors
  color: string;
  backgroundColor: string;
  // Typography
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: string;
  letterSpacing: string;
  lineHeight: string;
  // Spacing
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  // Size
  width: string;
  height: string;
  // Border
  borderWidth: string;
  borderColor: string;
  borderStyle: string;
  borderRadius: string;
  // Layout
  display: string;
  flexDirection: string;
  alignItems: string;
  justifyContent: string;
  gap: string;
}

// ─── PostMessage Protocol ────────────────────────────────────

export type IframeToBridgeMessage =
  | { type: "visual-edit:init" }
  | { type: "visual-edit:enable-selection" }
  | { type: "visual-edit:disable-selection" }
  | { type: "visual-edit:select-parent" }
  | { type: "visual-edit:update-text"; text: string }
  | { type: "visual-edit:deselect" }
  | { type: "visual-edit:apply-style"; property: string; value: string }
  | { type: "visual-edit:apply-text"; text: string }
  | { type: "visual-edit:revert-changes" }
  | { type: "visual-edit:highlight-element"; selector: string };

export type BridgeToParentMessage =
  | { type: "visual-edit:ready" }
  | { type: "visual-edit:element-hovered"; element: SelectedElement | null }
  | { type: "visual-edit:element-selected"; element: SelectedElement }
  | { type: "visual-edit:element-deselected" }
  | { type: "visual-edit:parent-selected"; element: SelectedElement };

// ─── Property Change Tracking ────────────────────────────────

export interface PropertyChange {
  property: string;
  label: string;
  oldValue: string;
  newValue: string;
}

// ─── Visual Edit State ───────────────────────────────────────

export type VisualEditMode = "idle" | "selecting" | "editing";

// ─── Preview Device Mode ────────────────────────────────────

export type DeviceMode = "desktop" | "tablet" | "mobile";

export const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};
