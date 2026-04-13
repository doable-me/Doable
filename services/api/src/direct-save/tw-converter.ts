// =============================================================================
// Tailwind CSS Converter — cssToTailwind
// Maps CSS property/value pairs to Tailwind utility classes.
// =============================================================================

import { FONT_SIZES, FONT_WEIGHTS, FONT_STYLE, TEXT_DECORATION, TEXT_TRANSFORM, TEXT_ALIGN, LINE_HEIGHT, LETTER_SPACING } from './tw-typography.js';
import { SPACING_SCALE, BORDER_RADIUS, DISPLAY, FLEX_DIRECTION, FLEX_WRAP, ALIGN_ITEMS, JUSTIFY_CONTENT, OPACITY, POSITION, OVERFLOW, OVERFLOW_X, OVERFLOW_Y } from './tw-layout.js';
import { BORDER_WIDTH, BORDER_STYLE, WIDTH_VALUES, HEIGHT_VALUES, MIN_WIDTH_VALUES, MAX_WIDTH_VALUES, MIN_HEIGHT_VALUES, MAX_HEIGHT_VALUES, Z_INDEX, OBJECT_FIT, CURSOR } from './tw-dimensions.js';
import { parseColor, findTailwindColor, SPACING_PREFIX_MAP, formatArbitraryValue } from './tw-colors.js';

export function cssToTailwind(property: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  switch (property) {
    case 'fontSize': {
      const mapped = FONT_SIZES[v];
      if (mapped) return mapped;
      return `text-[${formatArbitraryValue(v)}]`;
    }
    case 'fontWeight': {
      const mapped = FONT_WEIGHTS[v];
      if (mapped) return mapped;
      return `font-[${formatArbitraryValue(v)}]`;
    }
    case 'fontStyle': {
      const mapped = FONT_STYLE[v];
      if (mapped) return mapped;
      return null;
    }
    case 'textDecoration':
    case 'textDecorationLine': {
      const mapped = TEXT_DECORATION[v];
      if (mapped) return mapped;
      return null;
    }
    case 'textTransform': {
      const mapped = TEXT_TRANSFORM[v];
      if (mapped) return mapped;
      return null;
    }
    case 'textAlign': {
      const mapped = TEXT_ALIGN[v];
      if (mapped) return mapped;
      return null;
    }
    case 'lineHeight': {
      const mapped = LINE_HEIGHT[v];
      if (mapped) return mapped;
      return `leading-[${formatArbitraryValue(v)}]`;
    }
    case 'letterSpacing': {
      const mapped = LETTER_SPACING[v];
      if (mapped) return mapped;
      return `tracking-[${formatArbitraryValue(v)}]`;
    }
    case 'color': {
      if (v === 'transparent') return 'text-transparent';
      if (v === 'inherit') return 'text-inherit';
      if (v === 'currentColor' || v === 'currentcolor') return 'text-current';
      const rgb = parseColor(v);
      if (rgb) {
        const twColor = findTailwindColor(rgb);
        if (twColor) return `text-${twColor}`;
      }
      return `text-[${formatArbitraryValue(v)}]`;
    }
    case 'backgroundColor': {
      if (v === 'transparent') return 'bg-transparent';
      if (v === 'inherit') return 'bg-inherit';
      if (v === 'currentColor' || v === 'currentcolor') return 'bg-current';
      const rgb = parseColor(v);
      if (rgb) {
        const twColor = findTailwindColor(rgb);
        if (twColor) return `bg-${twColor}`;
      }
      return `bg-[${formatArbitraryValue(v)}]`;
    }
    case 'borderColor': {
      if (v === 'transparent') return 'border-transparent';
      if (v === 'inherit') return 'border-inherit';
      if (v === 'currentColor' || v === 'currentcolor') return 'border-current';
      const rgb = parseColor(v);
      if (rgb) {
        const twColor = findTailwindColor(rgb);
        if (twColor) return `border-${twColor}`;
      }
      return `border-[${formatArbitraryValue(v)}]`;
    }
    case 'borderWidth': {
      const mapped = BORDER_WIDTH[v];
      if (mapped) return mapped;
      return `border-[${formatArbitraryValue(v)}]`;
    }
    case 'borderStyle': {
      const mapped = BORDER_STYLE[v];
      if (mapped) return mapped;
      return null;
    }
    case 'borderRadius': {
      const mapped = BORDER_RADIUS[v];
      if (mapped) return mapped;
      return `rounded-[${formatArbitraryValue(v)}]`;
    }
    case 'borderTopLeftRadius': {
      const mapped = BORDER_RADIUS[v];
      if (mapped) {
        const suffix = mapped === 'rounded' ? '' : mapped.replace('rounded-', '');
        return suffix ? `rounded-tl-${suffix}` : 'rounded-tl';
      }
      return `rounded-tl-[${formatArbitraryValue(v)}]`;
    }
    case 'borderTopRightRadius': {
      const mapped = BORDER_RADIUS[v];
      if (mapped) {
        const suffix = mapped === 'rounded' ? '' : mapped.replace('rounded-', '');
        return suffix ? `rounded-tr-${suffix}` : 'rounded-tr';
      }
      return `rounded-tr-[${formatArbitraryValue(v)}]`;
    }
    case 'borderBottomLeftRadius': {
      const mapped = BORDER_RADIUS[v];
      if (mapped) {
        const suffix = mapped === 'rounded' ? '' : mapped.replace('rounded-', '');
        return suffix ? `rounded-bl-${suffix}` : 'rounded-bl';
      }
      return `rounded-bl-[${formatArbitraryValue(v)}]`;
    }
    case 'borderBottomRightRadius': {
      const mapped = BORDER_RADIUS[v];
      if (mapped) {
        const suffix = mapped === 'rounded' ? '' : mapped.replace('rounded-', '');
        return suffix ? `rounded-br-${suffix}` : 'rounded-br';
      }
      return `rounded-br-[${formatArbitraryValue(v)}]`;
    }
    case 'display': {
      const mapped = DISPLAY[v];
      if (mapped) return mapped;
      return null;
    }
    case 'flexDirection': {
      const mapped = FLEX_DIRECTION[v];
      if (mapped) return mapped;
      return null;
    }
    case 'flexWrap': {
      const mapped = FLEX_WRAP[v];
      if (mapped) return mapped;
      return null;
    }
    case 'alignItems': {
      const mapped = ALIGN_ITEMS[v];
      if (mapped) return mapped;
      return `items-[${formatArbitraryValue(v)}]`;
    }
    case 'justifyContent': {
      const mapped = JUSTIFY_CONTENT[v];
      if (mapped) return mapped;
      return `justify-[${formatArbitraryValue(v)}]`;
    }
    case 'opacity': {
      const mapped = OPACITY[v];
      if (mapped) return mapped;
      return `opacity-[${formatArbitraryValue(v)}]`;
    }
    case 'position': {
      const mapped = POSITION[v];
      if (mapped) return mapped;
      return null;
    }
    case 'overflow': {
      const mapped = OVERFLOW[v];
      if (mapped) return mapped;
      return null;
    }
    case 'overflowX': {
      const mapped = OVERFLOW_X[v];
      if (mapped) return mapped;
      return null;
    }
    case 'overflowY': {
      const mapped = OVERFLOW_Y[v];
      if (mapped) return mapped;
      return null;
    }
    case 'width': {
      const kw = WIDTH_VALUES[v];
      if (kw) return kw;
      const sp = SPACING_SCALE[v];
      if (sp) return `w-${sp}`;
      return `w-[${formatArbitraryValue(v)}]`;
    }
    case 'height': {
      const kw = HEIGHT_VALUES[v];
      if (kw) return kw;
      const sp = SPACING_SCALE[v];
      if (sp) return `h-${sp}`;
      return `h-[${formatArbitraryValue(v)}]`;
    }
    case 'minWidth': {
      const kw = MIN_WIDTH_VALUES[v];
      if (kw) return kw;
      const sp = SPACING_SCALE[v];
      if (sp) return `min-w-${sp}`;
      return `min-w-[${formatArbitraryValue(v)}]`;
    }
    case 'maxWidth': {
      const kw = MAX_WIDTH_VALUES[v];
      if (kw) return kw;
      const sp = SPACING_SCALE[v];
      if (sp) return `max-w-${sp}`;
      return `max-w-[${formatArbitraryValue(v)}]`;
    }
    case 'minHeight': {
      const kw = MIN_HEIGHT_VALUES[v];
      if (kw) return kw;
      const sp = SPACING_SCALE[v];
      if (sp) return `min-h-${sp}`;
      return `min-h-[${formatArbitraryValue(v)}]`;
    }
    case 'maxHeight': {
      const kw = MAX_HEIGHT_VALUES[v];
      if (kw) return kw;
      const sp = SPACING_SCALE[v];
      if (sp) return `max-h-${sp}`;
      return `max-h-[${formatArbitraryValue(v)}]`;
    }
    case 'zIndex': {
      const mapped = Z_INDEX[v];
      if (mapped) return mapped;
      return `z-[${formatArbitraryValue(v)}]`;
    }
    case 'objectFit': {
      const mapped = OBJECT_FIT[v];
      if (mapped) return mapped;
      return null;
    }
    case 'cursor': {
      const mapped = CURSOR[v];
      if (mapped) return mapped;
      return `cursor-[${formatArbitraryValue(v)}]`;
    }
    case 'flexGrow': {
      if (v === '0') return 'grow-0';
      if (v === '1') return 'grow';
      return `grow-[${v}]`;
    }
    case 'flexShrink': {
      if (v === '0') return 'shrink-0';
      if (v === '1') return 'shrink';
      return `shrink-[${v}]`;
    }
    case 'flexBasis': {
      if (v === 'auto') return 'basis-auto';
      if (v === '100%') return 'basis-full';
      const sp = SPACING_SCALE[v];
      if (sp) return `basis-${sp}`;
      return `basis-[${formatArbitraryValue(v)}]`;
    }
    case 'alignSelf': {
      const map: Record<string, string> = {
        'auto': 'self-auto', 'flex-start': 'self-start', 'start': 'self-start',
        'center': 'self-center', 'flex-end': 'self-end', 'end': 'self-end',
        'stretch': 'self-stretch', 'baseline': 'self-baseline',
      };
      return map[v] ?? null;
    }
    case 'whiteSpace': {
      const map: Record<string, string> = {
        'normal': 'whitespace-normal', 'nowrap': 'whitespace-nowrap',
        'pre': 'whitespace-pre', 'pre-line': 'whitespace-pre-line',
        'pre-wrap': 'whitespace-pre-wrap', 'break-spaces': 'whitespace-break-spaces',
      };
      return map[v] ?? null;
    }
    case 'wordBreak': {
      if (v === 'break-all') return 'break-all';
      if (v === 'keep-all') return 'break-keep';
      if (v === 'normal') return 'break-normal';
      return null;
    }
    case 'overflowWrap': {
      if (v === 'break-word') return 'break-words';
      if (v === 'normal') return 'break-normal';
      return null;
    }
    case 'boxShadow': {
      if (v === 'none') return 'shadow-none';
      return `shadow-[${formatArbitraryValue(v)}]`;
    }
    case 'transitionProperty': {
      const map: Record<string, string> = {
        'none': 'transition-none', 'all': 'transition-all',
        'opacity': 'transition-opacity', 'box-shadow': 'transition-shadow',
        'transform': 'transition-transform',
      };
      return map[v] ?? null;
    }
    case 'gridTemplateColumns': {
      const colMatch = v.match(/^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/);
      if (colMatch) return `grid-cols-${colMatch[1]}`;
      if (v === 'none') return 'grid-cols-none';
      if (v === 'subgrid') return 'grid-cols-subgrid';
      return `grid-cols-[${formatArbitraryValue(v)}]`;
    }
    case 'gridTemplateRows': {
      const rowMatch = v.match(/^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/);
      if (rowMatch) return `grid-rows-${rowMatch[1]}`;
      if (v === 'none') return 'grid-rows-none';
      if (v === 'subgrid') return 'grid-rows-subgrid';
      return `grid-rows-[${formatArbitraryValue(v)}]`;
    }
    case 'gridColumn': {
      const spanMatch = v.match(/^span\s+(\d+)\s*\/\s*span\s+(\d+)$/);
      if (spanMatch) return `col-span-${spanMatch[1]}`;
      if (v === '1 / -1') return 'col-span-full';
      return `col-[${formatArbitraryValue(v)}]`;
    }
    case 'gridRow': {
      const spanMatch = v.match(/^span\s+(\d+)\s*\/\s*span\s+(\d+)$/);
      if (spanMatch) return `row-span-${spanMatch[1]}`;
      if (v === '1 / -1') return 'row-span-full';
      return `row-[${formatArbitraryValue(v)}]`;
    }
    default:
      break;
  }

  // Spacing properties (padding, margin, gap, inset, top/right/bottom/left)
  const spacingPrefix = SPACING_PREFIX_MAP[property];
  if (spacingPrefix) {
    if (v === 'auto' && (property.startsWith('margin') || property === 'inset' ||
        property === 'top' || property === 'right' || property === 'bottom' || property === 'left')) {
      return `${spacingPrefix}-auto`;
    }
    const scale = SPACING_SCALE[v];
    if (scale) return `${spacingPrefix}-${scale}`;
    return `${spacingPrefix}-[${formatArbitraryValue(v)}]`;
  }

  return null;
}
