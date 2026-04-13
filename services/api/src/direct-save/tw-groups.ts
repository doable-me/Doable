// =============================================================================
// Tailwind CSS Property Group Detection
// getTailwindPropertyGroup + isClassInGroup
// =============================================================================

import {
  FONT_SIZE_CLASSES, FONT_WEIGHT_CLASSES, TEXT_ALIGN_CLASSES,
  LINE_HEIGHT_CLASSES, LETTER_SPACING_CLASSES,
} from './tw-typography.js';
import {
  BORDER_RADIUS_CLASSES, DISPLAY_CLASSES, FLEX_DIRECTION_CLASSES,
  FLEX_WRAP_CLASSES, ALIGN_ITEMS_CLASSES, JUSTIFY_CONTENT_CLASSES,
  OPACITY_CLASSES, POSITION_CLASSES,
} from './tw-layout.js';
import { BORDER_WIDTH_CLASSES } from './tw-dimensions.js';
import {
  COLOR_NAMES_RE, TEXT_SIZE_RE, isSpacingClass,
  isTextColorClass, isBgColorClass, isBorderColorClass,
} from './tw-colors.js';

export function getTailwindPropertyGroup(property: string): string {
  switch (property) {
    case 'fontSize': return 'text-';
    case 'fontWeight': return 'font-';
    case 'fontStyle': return 'font-style';
    case 'textDecoration':
    case 'textDecorationLine': return 'text-decoration';
    case 'textTransform': return 'text-transform';
    case 'textAlign': return 'text-align';
    case 'lineHeight': return 'leading-';
    case 'letterSpacing': return 'tracking-';
    case 'color': return 'text-color';
    case 'backgroundColor': return 'bg-';
    case 'borderColor': return 'border-color';
    case 'borderWidth': return 'border-width';
    case 'borderStyle': return 'border-style';
    case 'borderRadius': return 'rounded';
    case 'borderTopLeftRadius': return 'rounded-tl';
    case 'borderTopRightRadius': return 'rounded-tr';
    case 'borderBottomLeftRadius': return 'rounded-bl';
    case 'borderBottomRightRadius': return 'rounded-br';
    case 'display': return 'display';
    case 'flexDirection': return 'flex-direction';
    case 'flexWrap': return 'flex-wrap';
    case 'alignItems': return 'items-';
    case 'justifyContent': return 'justify-';
    case 'alignSelf': return 'self-';
    case 'opacity': return 'opacity-';
    case 'position': return 'position';
    case 'overflow': return 'overflow-';
    case 'overflowX': return 'overflow-x-';
    case 'overflowY': return 'overflow-y-';
    case 'width': return 'w-';
    case 'height': return 'h-';
    case 'minWidth': return 'min-w-';
    case 'maxWidth': return 'max-w-';
    case 'minHeight': return 'min-h-';
    case 'maxHeight': return 'max-h-';
    case 'zIndex': return 'z-';
    case 'objectFit': return 'object-';
    case 'cursor': return 'cursor-';
    case 'flexGrow': return 'grow';
    case 'flexShrink': return 'shrink';
    case 'flexBasis': return 'basis-';
    case 'whiteSpace': return 'whitespace-';
    case 'wordBreak':
    case 'overflowWrap': return 'break-';
    case 'boxShadow': return 'shadow-';
    case 'transitionProperty': return 'transition-';
    case 'gridTemplateColumns': return 'grid-cols-';
    case 'gridTemplateRows': return 'grid-rows-';
    case 'gridColumn': return 'col-';
    case 'gridRow': return 'row-';
    case 'padding': return 'p-';
    case 'paddingTop': return 'pt-';
    case 'paddingRight': return 'pr-';
    case 'paddingBottom': return 'pb-';
    case 'paddingLeft': return 'pl-';
    case 'paddingInline': return 'px-';
    case 'paddingBlock': return 'py-';
    case 'margin': return 'm-';
    case 'marginTop': return 'mt-';
    case 'marginRight': return 'mr-';
    case 'marginBottom': return 'mb-';
    case 'marginLeft': return 'ml-';
    case 'marginInline': return 'mx-';
    case 'marginBlock': return 'my-';
    case 'gap': return 'gap-';
    case 'rowGap': return 'gap-y-';
    case 'columnGap': return 'gap-x-';
    case 'top': return 'top-';
    case 'right': return 'right-';
    case 'bottom': return 'bottom-';
    case 'left': return 'left-';
    case 'inset': return 'inset-';
    default: return '';
  }
}

export function isClassInGroup(className: string, group: string): boolean {
  const cls = className.trim();

  switch (group) {
    case 'fontSize':
      if (FONT_SIZE_CLASSES.has(cls)) return true;
      if (TEXT_SIZE_RE.test(cls)) return true;
      return false;
    case 'fontWeight':
      if (FONT_WEIGHT_CLASSES.has(cls)) return true;
      return /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[.+\])$/.test(cls);
    case 'fontStyle':
      return cls === 'italic' || cls === 'not-italic';
    case 'textDecoration':
    case 'textDecorationLine':
      return cls === 'underline' || cls === 'overline' || cls === 'line-through' || cls === 'no-underline';
    case 'textTransform':
      return cls === 'uppercase' || cls === 'lowercase' || cls === 'capitalize' || cls === 'normal-case';
    case 'textAlign':
      return TEXT_ALIGN_CLASSES.has(cls);
    case 'lineHeight':
      if (LINE_HEIGHT_CLASSES.has(cls)) return true;
      return /^leading-\[.+\]$/.test(cls);
    case 'letterSpacing':
      if (LETTER_SPACING_CLASSES.has(cls)) return true;
      return /^tracking-\[.+\]$/.test(cls);
    case 'color':
      return isTextColorClass(cls);
    case 'backgroundColor':
      return isBgColorClass(cls);
    case 'borderColor':
      return isBorderColorClass(cls);
    case 'borderWidth':
      if (BORDER_WIDTH_CLASSES.has(cls)) return true;
      return false;
    case 'borderStyle':
      return /^border-(solid|dashed|dotted|double|none|hidden)$/.test(cls);
    case 'borderRadius':
      if (BORDER_RADIUS_CLASSES.has(cls)) return true;
      return /^rounded-\[.+\]$/.test(cls);
    case 'borderTopLeftRadius':
      return /^rounded-tl(-.*)?$/.test(cls);
    case 'borderTopRightRadius':
      return /^rounded-tr(-.*)?$/.test(cls);
    case 'borderBottomLeftRadius':
      return /^rounded-bl(-.*)?$/.test(cls);
    case 'borderBottomRightRadius':
      return /^rounded-br(-.*)?$/.test(cls);
    case 'display':
      return DISPLAY_CLASSES.has(cls);
    case 'flexDirection':
      return FLEX_DIRECTION_CLASSES.has(cls);
    case 'flexWrap':
      return FLEX_WRAP_CLASSES.has(cls);
    case 'alignItems':
      if (ALIGN_ITEMS_CLASSES.has(cls)) return true;
      return /^items-\[.+\]$/.test(cls);
    case 'justifyContent':
      if (JUSTIFY_CONTENT_CLASSES.has(cls)) return true;
      return /^justify-\[.+\]$/.test(cls);
    case 'alignSelf':
      return /^self-(auto|start|center|end|stretch|baseline)$/.test(cls);
    case 'opacity':
      if (OPACITY_CLASSES.has(cls)) return true;
      return /^opacity-\[.+\]$/.test(cls);
    case 'position':
      return POSITION_CLASSES.has(cls);
    case 'overflow':
      return /^overflow-(auto|hidden|visible|scroll|clip)$/.test(cls);
    case 'overflowX':
      return /^overflow-x-(auto|hidden|visible|scroll|clip)$/.test(cls);
    case 'overflowY':
      return /^overflow-y-(auto|hidden|visible|scroll|clip)$/.test(cls);
    case 'width':
      return /^w-/.test(cls);
    case 'height':
      return /^h-/.test(cls);
    case 'minWidth':
      return /^min-w-/.test(cls);
    case 'maxWidth':
      return /^max-w-/.test(cls);
    case 'minHeight':
      return /^min-h-/.test(cls);
    case 'maxHeight':
      return /^max-h-/.test(cls);
    case 'zIndex':
      return /^z-(0|10|20|30|40|50|auto|\[.+\])$/.test(cls);
    case 'objectFit':
      return /^object-(contain|cover|fill|none|scale-down)$/.test(cls);
    case 'cursor':
      return /^cursor-/.test(cls);
    case 'flexGrow':
      return cls === 'grow' || cls === 'grow-0' || /^grow-\[.+\]$/.test(cls);
    case 'flexShrink':
      return cls === 'shrink' || cls === 'shrink-0' || /^shrink-\[.+\]$/.test(cls);
    case 'flexBasis':
      return /^basis-/.test(cls);
    case 'whiteSpace':
      return /^whitespace-/.test(cls);
    case 'wordBreak':
    case 'overflowWrap':
      return /^break-(normal|words|all|keep)$/.test(cls);
    case 'boxShadow':
      return /^shadow(-|$)/.test(cls) &&
        !new RegExp(`^shadow-(${COLOR_NAMES_RE})`).test(cls);
    case 'transitionProperty':
      return /^transition(-|$)/.test(cls);
    case 'gridTemplateColumns':
      return /^grid-cols-/.test(cls);
    case 'gridTemplateRows':
      return /^grid-rows-/.test(cls);
    case 'gridColumn':
      return /^col-/.test(cls);
    case 'gridRow':
      return /^row-/.test(cls);
    case 'padding':
      return isSpacingClass(cls, 'p');
    case 'paddingTop':
      return isSpacingClass(cls, 'pt');
    case 'paddingRight':
      return isSpacingClass(cls, 'pr');
    case 'paddingBottom':
      return isSpacingClass(cls, 'pb');
    case 'paddingLeft':
      return isSpacingClass(cls, 'pl');
    case 'paddingInline':
      return isSpacingClass(cls, 'px');
    case 'paddingBlock':
      return isSpacingClass(cls, 'py');
    case 'margin':
      return isSpacingClass(cls, 'm');
    case 'marginTop':
      return isSpacingClass(cls, 'mt');
    case 'marginRight':
      return isSpacingClass(cls, 'mr');
    case 'marginBottom':
      return isSpacingClass(cls, 'mb');
    case 'marginLeft':
      return isSpacingClass(cls, 'ml');
    case 'marginInline':
      return isSpacingClass(cls, 'mx');
    case 'marginBlock':
      return isSpacingClass(cls, 'my');
    case 'gap':
      return isSpacingClass(cls, 'gap') && !cls.startsWith('gap-x-') && !cls.startsWith('gap-y-');
    case 'rowGap':
      return /^gap-y-/.test(cls);
    case 'columnGap':
      return /^gap-x-/.test(cls);
    case 'top':
      return isSpacingClass(cls, 'top');
    case 'right':
      return isSpacingClass(cls, 'right');
    case 'bottom':
      return isSpacingClass(cls, 'bottom');
    case 'left':
      return isSpacingClass(cls, 'left');
    case 'inset':
      return isSpacingClass(cls, 'inset');
    default:
      return false;
  }
}
