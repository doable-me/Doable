// =============================================================================
// Tailwind CSS Color Palette, Parsing, and Detection Utilities
// =============================================================================

import { FONT_SIZE_CLASSES, TEXT_ALIGN_CLASSES } from './tw-typography.js';
import { BORDER_WIDTH_CLASSES } from './tw-dimensions.js';

interface ColorEntry {
  name: string;
  shade: number;
  r: number;
  g: number;
  b: number;
}

const TAILWIND_COLORS: ColorEntry[] = buildColorPalette();

function buildColorPalette(): ColorEntry[] {
  const families: Record<string, Record<number, [number, number, number]>> = {
    slate: {
      50: [248, 250, 252], 100: [241, 245, 249], 200: [226, 232, 240], 300: [203, 213, 225],
      400: [148, 163, 184], 500: [100, 116, 139], 600: [71, 85, 105], 700: [51, 65, 85],
      800: [30, 41, 59], 900: [15, 23, 42], 950: [2, 6, 23],
    },
    gray: {
      50: [249, 250, 251], 100: [243, 244, 246], 200: [229, 231, 235], 300: [209, 213, 219],
      400: [156, 163, 175], 500: [107, 114, 128], 600: [75, 85, 99], 700: [55, 65, 81],
      800: [31, 41, 55], 900: [17, 24, 39], 950: [3, 7, 18],
    },
    zinc: {
      50: [250, 250, 250], 100: [244, 244, 245], 200: [228, 228, 231], 300: [212, 212, 216],
      400: [161, 161, 170], 500: [113, 113, 122], 600: [82, 82, 91], 700: [63, 63, 70],
      800: [39, 39, 42], 900: [24, 24, 27], 950: [9, 9, 11],
    },
    neutral: {
      50: [250, 250, 250], 100: [245, 245, 245], 200: [229, 229, 229], 300: [212, 212, 212],
      400: [163, 163, 163], 500: [115, 115, 115], 600: [82, 82, 82], 700: [64, 64, 64],
      800: [38, 38, 38], 900: [23, 23, 23], 950: [10, 10, 10],
    },
    stone: {
      50: [250, 250, 249], 100: [245, 245, 244], 200: [231, 229, 228], 300: [214, 211, 209],
      400: [168, 162, 158], 500: [120, 113, 108], 600: [87, 83, 78], 700: [68, 64, 60],
      800: [41, 37, 36], 900: [28, 25, 23], 950: [12, 10, 9],
    },
    red: {
      50: [254, 242, 242], 100: [254, 226, 226], 200: [254, 202, 202], 300: [252, 165, 165],
      400: [248, 113, 113], 500: [239, 68, 68], 600: [220, 38, 38], 700: [185, 28, 28],
      800: [153, 27, 27], 900: [127, 29, 29], 950: [69, 10, 10],
    },
    orange: {
      50: [255, 247, 237], 100: [255, 237, 213], 200: [254, 215, 170], 300: [253, 186, 116],
      400: [251, 146, 60], 500: [249, 115, 22], 600: [234, 88, 12], 700: [194, 65, 12],
      800: [154, 52, 18], 900: [124, 45, 18], 950: [67, 20, 7],
    },
    amber: {
      50: [255, 251, 235], 100: [254, 243, 199], 200: [253, 230, 138], 300: [252, 211, 77],
      400: [251, 191, 36], 500: [245, 158, 11], 600: [217, 119, 6], 700: [180, 83, 9],
      800: [146, 64, 14], 900: [120, 53, 15], 950: [69, 26, 3],
    },
    yellow: {
      50: [254, 252, 232], 100: [254, 249, 195], 200: [254, 240, 138], 300: [253, 224, 71],
      400: [250, 204, 21], 500: [234, 179, 8], 600: [202, 138, 4], 700: [161, 98, 7],
      800: [133, 77, 14], 900: [113, 63, 18], 950: [66, 32, 6],
    },
    lime: {
      50: [247, 254, 231], 100: [236, 252, 203], 200: [217, 249, 157], 300: [190, 242, 100],
      400: [163, 230, 53], 500: [132, 204, 22], 600: [101, 163, 13], 700: [77, 124, 15],
      800: [63, 98, 18], 900: [54, 83, 20], 950: [26, 46, 5],
    },
    green: {
      50: [240, 253, 244], 100: [220, 252, 231], 200: [187, 247, 208], 300: [134, 239, 172],
      400: [74, 222, 128], 500: [34, 197, 94], 600: [22, 163, 74], 700: [21, 128, 61],
      800: [22, 101, 52], 900: [20, 83, 45], 950: [5, 46, 22],
    },
    emerald: {
      50: [236, 253, 245], 100: [209, 250, 229], 200: [167, 243, 208], 300: [110, 231, 183],
      400: [52, 211, 153], 500: [16, 185, 129], 600: [5, 150, 105], 700: [4, 120, 87],
      800: [6, 95, 70], 900: [6, 78, 59], 950: [2, 44, 34],
    },
    teal: {
      50: [240, 253, 250], 100: [204, 251, 241], 200: [153, 246, 228], 300: [94, 234, 212],
      400: [45, 212, 191], 500: [20, 184, 166], 600: [13, 148, 136], 700: [15, 118, 110],
      800: [17, 94, 89], 900: [19, 78, 74], 950: [4, 47, 46],
    },
    cyan: {
      50: [236, 254, 255], 100: [207, 250, 254], 200: [165, 243, 252], 300: [103, 232, 249],
      400: [34, 211, 238], 500: [6, 182, 212], 600: [8, 145, 178], 700: [14, 116, 144],
      800: [21, 94, 117], 900: [22, 78, 99], 950: [8, 51, 68],
    },
    sky: {
      50: [240, 249, 255], 100: [224, 242, 254], 200: [186, 230, 253], 300: [125, 211, 252],
      400: [56, 189, 248], 500: [14, 165, 233], 600: [2, 132, 199], 700: [3, 105, 161],
      800: [7, 89, 133], 900: [12, 74, 110], 950: [8, 47, 73],
    },
    blue: {
      50: [239, 246, 255], 100: [219, 234, 254], 200: [191, 219, 254], 300: [147, 197, 253],
      400: [96, 165, 250], 500: [59, 130, 246], 600: [37, 99, 235], 700: [29, 78, 216],
      800: [30, 64, 175], 900: [30, 58, 138], 950: [23, 37, 84],
    },
    indigo: {
      50: [238, 242, 255], 100: [224, 231, 255], 200: [199, 210, 254], 300: [165, 180, 252],
      400: [129, 140, 248], 500: [99, 102, 241], 600: [79, 70, 229], 700: [67, 56, 202],
      800: [55, 48, 163], 900: [49, 46, 129], 950: [30, 27, 75],
    },
    violet: {
      50: [245, 243, 255], 100: [237, 233, 254], 200: [221, 214, 254], 300: [196, 181, 253],
      400: [167, 139, 250], 500: [139, 92, 246], 600: [124, 58, 237], 700: [109, 40, 217],
      800: [91, 33, 182], 900: [76, 29, 149], 950: [46, 16, 101],
    },
    purple: {
      50: [250, 245, 255], 100: [243, 232, 255], 200: [233, 213, 255], 300: [216, 180, 254],
      400: [192, 132, 252], 500: [168, 85, 247], 600: [147, 51, 234], 700: [126, 34, 206],
      800: [107, 33, 168], 900: [88, 28, 135], 950: [59, 7, 100],
    },
    fuchsia: {
      50: [253, 244, 255], 100: [250, 232, 255], 200: [245, 208, 254], 300: [240, 171, 252],
      400: [232, 121, 249], 500: [217, 70, 239], 600: [192, 38, 211], 700: [162, 28, 175],
      800: [134, 25, 143], 900: [112, 26, 117], 950: [74, 4, 78],
    },
    pink: {
      50: [253, 242, 248], 100: [252, 231, 243], 200: [251, 207, 232], 300: [249, 168, 212],
      400: [244, 114, 182], 500: [236, 72, 153], 600: [219, 39, 119], 700: [190, 24, 93],
      800: [157, 23, 77], 900: [131, 24, 67], 950: [80, 7, 36],
    },
    rose: {
      50: [255, 241, 242], 100: [255, 228, 230], 200: [254, 205, 211], 300: [253, 164, 175],
      400: [251, 113, 133], 500: [244, 63, 94], 600: [225, 29, 72], 700: [190, 18, 60],
      800: [159, 18, 57], 900: [136, 19, 55], 950: [76, 5, 25],
    },
  };

  const entries: ColorEntry[] = [];
  for (const [name, shades] of Object.entries(families)) {
    for (const [shade, rgb] of Object.entries(shades)) {
      entries.push({ name, shade: Number(shade), r: rgb[0], g: rgb[1], b: rgb[2] });
    }
  }
  return entries;
}

function parseColor(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return null;
  if (v === 'white') return [255, 255, 255];
  if (v === 'black') return [0, 0, 0];
  if (v === 'inherit' || v === 'initial' || v === 'unset' || v === 'currentcolor') return null;

  const hexMatch = v.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    const hex = hexMatch[1]!;
    if (hex.length === 3 || hex.length === 4) {
      return [
        parseInt(hex.charAt(0) + hex.charAt(0), 16),
        parseInt(hex.charAt(1) + hex.charAt(1), 16),
        parseInt(hex.charAt(2) + hex.charAt(2), 16),
      ];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  const rgbMatch = v.match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]!, 10), parseInt(rgbMatch[2]!, 10), parseInt(rgbMatch[3]!, 10)];
  }

  return null;
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

const COLOR_MATCH_THRESHOLD = 10;

export function findTailwindColor(rgb: [number, number, number]): string | null {
  if (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255) return 'white';
  if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) return 'black';

  let bestMatch: ColorEntry | null = null;
  let bestDistance = Infinity;

  for (const entry of TAILWIND_COLORS) {
    const dist = colorDistance(rgb, [entry.r, entry.g, entry.b]);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = entry;
    }
  }

  if (bestMatch && bestDistance <= COLOR_MATCH_THRESHOLD) {
    return `${bestMatch.name}-${bestMatch.shade}`;
  }

  return null;
}

export { parseColor };

// CSS property -> prefix mapping for spacing properties
export const SPACING_PREFIX_MAP: Record<string, string> = {
  padding: 'p',
  paddingTop: 'pt',
  paddingRight: 'pr',
  paddingBottom: 'pb',
  paddingLeft: 'pl',
  paddingInline: 'px',
  paddingBlock: 'py',
  margin: 'm',
  marginTop: 'mt',
  marginRight: 'mr',
  marginBottom: 'mb',
  marginLeft: 'ml',
  marginInline: 'mx',
  marginBlock: 'my',
  gap: 'gap',
  rowGap: 'gap-y',
  columnGap: 'gap-x',
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
  inset: 'inset',
};

export function isSpacingClass(cls: string, prefix: string): boolean {
  if (!cls.startsWith(`${prefix}-`)) return false;
  const suffix = cls.slice(prefix.length + 1);
  if (suffix.startsWith('[') && suffix.endsWith(']')) return true;
  if (suffix === 'auto') return true;
  if (suffix === 'px') return true;
  return /^(\d+(\.\d+)?)$/.test(suffix);
}

export const COLOR_NAMES_RE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

const TEXT_COLOR_RE = new RegExp(
  `^text-(${COLOR_NAMES_RE})-\\d+$|^text-(white|black|transparent|inherit|current)$|^text-\\[#[0-9a-fA-F]+\\]$|^text-\\[rgb`
);

const BG_COLOR_RE = new RegExp(
  `^bg-(${COLOR_NAMES_RE})-\\d+$|^bg-(white|black|transparent|inherit|current)$|^bg-\\[#[0-9a-fA-F]+\\]$|^bg-\\[rgb`
);

const BORDER_COLOR_RE = new RegExp(
  `^border-(${COLOR_NAMES_RE})-\\d+$|^border-(white|black|transparent|inherit|current)$|^border-\\[#[0-9a-fA-F]+\\]$|^border-\\[rgb`
);

export const TEXT_SIZE_RE = /^text-(xs|sm|base|lg|xl|[2-9]xl|\[.+\])$/;

export function isTextColorClass(cls: string): boolean {
  if (!cls.startsWith('text-')) return false;
  if (FONT_SIZE_CLASSES.has(cls)) return false;
  if (TEXT_ALIGN_CLASSES.has(cls)) return false;
  if (TEXT_SIZE_RE.test(cls)) return false;
  return TEXT_COLOR_RE.test(cls) || /^text-\[.+\]$/.test(cls);
}

export function isBgColorClass(cls: string): boolean {
  return BG_COLOR_RE.test(cls) || /^bg-\[.+\]$/.test(cls);
}

export function isBorderColorClass(cls: string): boolean {
  if (!cls.startsWith('border-')) return false;
  if (BORDER_WIDTH_CLASSES.has(cls)) return false;
  if (cls === 'border-solid' || cls === 'border-dashed' || cls === 'border-dotted' ||
      cls === 'border-double' || cls === 'border-none' || cls === 'border-hidden') return false;
  return BORDER_COLOR_RE.test(cls);
}

export function formatArbitraryValue(value: string): string {
  return value.replace(/\s+/g, '_');
}
