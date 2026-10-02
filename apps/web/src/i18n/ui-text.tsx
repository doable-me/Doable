import { useUiText } from "./use-ui-text";
export function UiText({ children }: { children: string }) {
  const ui = useUiText();
  return <>{ui(children)}</>;
}
