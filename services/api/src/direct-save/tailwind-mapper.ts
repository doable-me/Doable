// =============================================================================
// Tailwind CSS Mapper for the Doable Visual Editor
// Maps CSS property values to Tailwind classes and vice versa.
// =============================================================================

// ---------------------------------------------------------------------------
// Font size scale
// ---------------------------------------------------------------------------
const FONT_SIZES: Record<string, string> = {
  '0.75rem': 'text-xs',
  '0.875rem': 'text-sm',
  '1rem': 'text-base',
  '1.125rem': 'text-lg',
  '1.25rem': 'text-xl',
  '1.5rem': 'text-2xl',
  '1.875rem': 'text-3xl',
  '2.25rem': 'text-4xl',
  '3rem': 'text-5xl',
  '3.75rem': 'text-6xl',
  '4.5rem': 'text-7xl',
  '6rem': 'text-8xl',
  '8rem': 'text-9xl',
  '12px': 'text-xs',
  '14px': 'text-sm',
  '16px': 'text-base',
  '18px': 'text-lg',
  '20px': 'text-xl',
  '24px': 'text-2xl',
  '30px': 'text-3xl',
  '36px': 'text-4xl',
  '48px': 'text-5xl',
  '60px': 'text-6xl',
  '72px': 'text-7xl',
  '96px': 'text-8xl',
  '128px': 'text-9xl',
};

// Set of known text-size class names for group detection
const FONT_SIZE_CLASSES = new Set([
  'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl',
  'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl',
  'text-7xl', 'text-8xl', 'text-9xl',
]);

// ---------------------------------------------------------------------------
// Font weight scale
// ---------------------------------------------------------------------------
const FONT_WEIGHTS: Record<string, string> = {
  '100': 'font-thin',
  '200': 'font-extralight',
  '300': 'font-light',
  '400': 'font-normal',
  '500': 'font-medium',
  '600': 'font-semibold',
  '700': 'font-bold',
  '800': 'font-extrabold',
  '900': 'font-black',
  'thin': 'font-thin',
  'extralight': 'font-extralight',
  'light': 'font-light',
  'normal': 'font-normal',
  'medium': 'font-medium',
  'semibold': 'font-semibold',
  'bold': 'font-bold',
  'extrabold': 'font-extrabold',
  'black': 'font-black',
};

const FONT_WEIGHT_CLASSES = new Set([
  'font-thin', 'font-extralight', 'font-light', 'font-normal',
  'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black',
]);

// ---------------------------------------------------------------------------
// Spacing scale (used for padding, margin, gap, width, height, etc.)
// ---------------------------------------------------------------------------
const SPACING_SCALE: Record<string, string> = {
  '0': '0',
  '0px': '0',
  '1px': 'px',
  '0.125rem': '0.5',
  '2px': '0.5',
  '0.25rem': '1',
  '4px': '1',
  '0.375rem': '1.5',
  '6px': '1.5',
  '0.5rem': '2',
  '8px': '2',
  '0.625rem': '2.5',
  '10px': '2.5',
  '0.75rem': '3',
  '12px': '3',
  '0.875rem': '3.5',
  '14px': '3.5',
  '1rem': '4',
  '16px': '4',
  '1.25rem': '5',
  '20px': '5',
  '1.5rem': '6',
  '24px': '6',
  '1.75rem': '7',
  '28px': '7',
  '2rem': '8',
  '32px': '8',
  '2.25rem': '9',
  '36px': '9',
  '2.5rem': '10',
  '40px': '10',
  '2.75rem': '11',
  '44px': '11',
  '3rem': '12',
  '48px': '12',
  '3.5rem': '14',
  '56px': '14',
  '4rem': '16',
  '64px': '16',
  '5rem': '20',
  '80px': '20',
  '6rem': '24',
  '96px': '24',
  '7rem': '28',
  '112px': '28',
  '8rem': '32',
  '128px': '32',
  '9rem': '36',
  '144px': '36',
  '10rem': '40',
  '160px': '40',
  '11rem': '44',
  '176px': '44',
  '12rem': '48',
  '192px': '48',
  '13rem': '52',
  '208px': '52',
  '14rem': '56',
  '224px': '56',
  '15rem': '60',
  '240px': '60',
  '16rem': '64',
  '256px': '64',
  '18rem': '72',
  '288px': '72',
  '20rem': '80',
  '320px': '80',
  '24rem': '96',
  '384px': '96',
};

// ---------------------------------------------------------------------------
// Border radius scale
// ---------------------------------------------------------------------------
const BORDER_RADIUS: Record<string, string> = {
  '0': 'rounded-none',
  '0px': 'rounded-none',
  '0.125rem': 'rounded-sm',
  '2px': 'rounded-sm',
  '0.25rem': 'rounded',
  '4px': 'rounded',
  '0.375rem': 'rounded-md',
  '6px': 'rounded-md',
  '0.5rem': 'rounded-lg',
  '8px': 'rounded-lg',
  '0.75rem': 'rounded-xl',
  '12px': 'rounded-xl',
  '1rem': 'rounded-2xl',
  '16px': 'rounded-2xl',
  '1.5rem': 'rounded-3xl',
  '24px': 'rounded-3xl',
  '9999px': 'rounded-full',
  '50%': 'rounded-full',
};

const BORDER_RADIUS_CLASSES = new Set([
  'rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg',
  'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full',
]);

// ---------------------------------------------------------------------------
// Text alignment
// ---------------------------------------------------------------------------
const TEXT_ALIGN: Record<string, string> = {
  'left': 'text-left',
  'center': 'text-center',
  'right': 'text-right',
  'justify': 'text-justify',
};

const TEXT_ALIGN_CLASSES = new Set([
  'text-left', 'text-center', 'text-right', 'text-justify',
]);

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
const DISPLAY: Record<string, string> = {
  'block': 'block',
  'inline-block': 'inline-block',
  'inline': 'inline',
  'flex': 'flex',
  'inline-flex': 'inline-flex',
  'grid': 'grid',
  'inline-grid': 'inline-grid',
  'hidden': 'hidden',
  'none': 'hidden',
  'table': 'table',
  'table-row': 'table-row',
  'table-cell': 'table-cell',
  'contents': 'contents',
  'list-item': 'list-item',
};

const DISPLAY_CLASSES = new Set([
  'block', 'inline-block', 'inline', 'flex', 'inline-flex',
  'grid', 'inline-grid', 'hidden', 'table', 'table-row',
  'table-cell', 'contents', 'list-item',
]);

// ---------------------------------------------------------------------------
// Flex direction
// ---------------------------------------------------------------------------
const FLEX_DIRECTION: Record<string, string> = {
  'row': 'flex-row',
  'row-reverse': 'flex-row-reverse',
  'column': 'flex-col',
  'column-reverse': 'flex-col-reverse',
};

const FLEX_DIRECTION_CLASSES = new Set([
  'flex-row', 'flex-row-reverse', 'flex-col', 'flex-col-reverse',
]);

// ---------------------------------------------------------------------------
// Flex wrap
// ---------------------------------------------------------------------------
const FLEX_WRAP: Record<string, string> = {
  'wrap': 'flex-wrap',
  'nowrap': 'flex-nowrap',
  'wrap-reverse': 'flex-wrap-reverse',
};

const FLEX_WRAP_CLASSES = new Set([
  'flex-wrap', 'flex-nowrap', 'flex-wrap-reverse',
]);

// ---------------------------------------------------------------------------
// Align items
// ---------------------------------------------------------------------------
const ALIGN_ITEMS: Record<string, string> = {
  'flex-start': 'items-start',
  'start': 'items-start',
  'center': 'items-center',
  'flex-end': 'items-end',
  'end': 'items-end',
  'stretch': 'items-stretch',
  'baseline': 'items-baseline',
};

const ALIGN_ITEMS_CLASSES = new Set([
  'items-start', 'items-center', 'items-end', 'items-stretch', 'items-baseline',
]);

// ---------------------------------------------------------------------------
// Justify content
// ---------------------------------------------------------------------------
const JUSTIFY_CONTENT: Record<string, string> = {
  'flex-start': 'justify-start',
  'start': 'justify-start',
  'center': 'justify-center',
  'flex-end': 'justify-end',
  'end': 'justify-end',
  'space-between': 'justify-between',
  'space-around': 'justify-around',
  'space-evenly': 'justify-evenly',
};

const JUSTIFY_CONTENT_CLASSES = new Set([
  'justify-start', 'justify-center', 'justify-end',
  'justify-between', 'justify-around', 'justify-evenly',
]);

// ---------------------------------------------------------------------------
// Opacity
// ---------------------------------------------------------------------------
const OPACITY: Record<string, string> = {
  '0': 'opacity-0',
  '0.05': 'opacity-5',
  '0.1': 'opacity-10',
  '0.15': 'opacity-15',
  '0.2': 'opacity-20',
  '0.25': 'opacity-25',
  '0.3': 'opacity-30',
  '0.35': 'opacity-35',
  '0.4': 'opacity-40',
  '0.45': 'opacity-45',
  '0.5': 'opacity-50',
  '0.55': 'opacity-55',
  '0.6': 'opacity-60',
  '0.65': 'opacity-65',
  '0.7': 'opacity-70',
  '0.75': 'opacity-75',
  '0.8': 'opacity-80',
  '0.85': 'opacity-85',
  '0.9': 'opacity-90',
  '0.95': 'opacity-95',
  '1': 'opacity-100',
};

const OPACITY_CLASSES = new Set([
  'opacity-0', 'opacity-5', 'opacity-10', 'opacity-15', 'opacity-20',
  'opacity-25', 'opacity-30', 'opacity-35', 'opacity-40', 'opacity-45',
  'opacity-50', 'opacity-55', 'opacity-60', 'opacity-65', 'opacity-70',
  'opacity-75', 'opacity-80', 'opacity-85', 'opacity-90', 'opacity-95',
  'opacity-100',
]);

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------
const POSITION: Record<string, string> = {
  'static': 'static',
  'fixed': 'fixed',
  'absolute': 'absolute',
  'relative': 'relative',
  'sticky': 'sticky',
};

const POSITION_CLASSES = new Set([
  'static', 'fixed', 'absolute', 'relative', 'sticky',
]);

// ---------------------------------------------------------------------------
// Overflow
// ---------------------------------------------------------------------------
const OVERFLOW: Record<string, string> = {
  'auto': 'overflow-auto',
  'hidden': 'overflow-hidden',
  'visible': 'overflow-visible',
  'scroll': 'overflow-scroll',
  'clip': 'overflow-clip',
};

const OVERFLOW_X: Record<string, string> = {
  'auto': 'overflow-x-auto',
  'hidden': 'overflow-x-hidden',
  'visible': 'overflow-x-visible',
  'scroll': 'overflow-x-scroll',
  'clip': 'overflow-x-clip',
};

const OVERFLOW_Y: Record<string, string> = {
  'auto': 'overflow-y-auto',
  'hidden': 'overflow-y-hidden',
  'visible': 'overflow-y-visible',
  'scroll': 'overflow-y-scroll',
  'clip': 'overflow-y-clip',
};

// ---------------------------------------------------------------------------
// Font style
// ---------------------------------------------------------------------------
const FONT_STYLE: Record<string, string> = {
  'italic': 'italic',
  'normal': 'not-italic',
};

// ---------------------------------------------------------------------------
// Text decoration
// ---------------------------------------------------------------------------
const TEXT_DECORATION: Record<string, string> = {
  'underline': 'underline',
  'overline': 'overline',
  'line-through': 'line-through',
  'none': 'no-underline',
};

// ---------------------------------------------------------------------------
// Text transform
// ---------------------------------------------------------------------------
const TEXT_TRANSFORM: Record<string, string> = {
  'uppercase': 'uppercase',
  'lowercase': 'lowercase',
  'capitalize': 'capitalize',
  'none': 'normal-case',
};

// ---------------------------------------------------------------------------
// Line height
// ---------------------------------------------------------------------------
const LINE_HEIGHT: Record<string, string> = {
  '1': 'leading-none',
  '1.25': 'leading-tight',
  '1.375': 'leading-snug',
  '1.5': 'leading-normal',
  '1.625': 'leading-relaxed',
  '2': 'leading-loose',
  '0.75rem': 'leading-3',
  '1rem': 'leading-4',
  '1.25rem': 'leading-5',
  '1.5rem': 'leading-6',
  '1.75rem': 'leading-7',
  '2rem': 'leading-8',
  '2.25rem': 'leading-9',
  '2.5rem': 'leading-10',
  '12px': 'leading-3',
  '16px': 'leading-4',
  '20px': 'leading-5',
  '24px': 'leading-6',
  '28px': 'leading-7',
  '32px': 'leading-8',
  '36px': 'leading-9',
  '40px': 'leading-10',
};

const LINE_HEIGHT_CLASSES = new Set([
  'leading-none', 'leading-tight', 'leading-snug', 'leading-normal',
  'leading-relaxed', 'leading-loose', 'leading-3', 'leading-4',
  'leading-5', 'leading-6', 'leading-7', 'leading-8', 'leading-9', 'leading-10',
]);

// ---------------------------------------------------------------------------
// Letter spacing
// ---------------------------------------------------------------------------
const LETTER_SPACING: Record<string, string> = {
  '-0.05em': 'tracking-tighter',
  '-0.025em': 'tracking-tight',
  '0': 'tracking-normal',
  '0em': 'tracking-normal',
  '0.025em': 'tracking-wide',
  '0.05em': 'tracking-wider',
  '0.1em': 'tracking-widest',
};

const LETTER_SPACING_CLASSES = new Set([
  'tracking-tighter', 'tracking-tight', 'tracking-normal',
  'tracking-wide', 'tracking-wider', 'tracking-widest',
]);

// ---------------------------------------------------------------------------
// Border width
// ---------------------------------------------------------------------------
const BORDER_WIDTH: Record<string, string> = {
  '0': 'border-0',
  '0px': 'border-0',
  '1px': 'border',
  '2px': 'border-2',
  '4px': 'border-4',
  '8px': 'border-8',
};

const BORDER_WIDTH_CLASSES = new Set([
  'border-0', 'border', 'border-2', 'border-4', 'border-8',
]);

// ---------------------------------------------------------------------------
// Width / height percentage and keyword values
// ---------------------------------------------------------------------------
const WIDTH_VALUES: Record<string, string> = {
  'auto': 'w-auto',
  '100%': 'w-full',
  '100vw': 'w-screen',
  'min-content': 'w-min',
  'max-content': 'w-max',
  'fit-content': 'w-fit',
  '50%': 'w-1/2',
  '33.333333%': 'w-1/3',
  '66.666667%': 'w-2/3',
  '25%': 'w-1/4',
  '75%': 'w-3/4',
  '20%': 'w-1/5',
  '40%': 'w-2/5',
  '60%': 'w-3/5',
  '80%': 'w-4/5',
  '16.666667%': 'w-1/6',
  '83.333333%': 'w-5/6',
};

const HEIGHT_VALUES: Record<string, string> = {
  'auto': 'h-auto',
  '100%': 'h-full',
  '100vh': 'h-screen',
  'min-content': 'h-min',
  'max-content': 'h-max',
  'fit-content': 'h-fit',
  '50%': 'h-1/2',
  '33.333333%': 'h-1/3',
  '66.666667%': 'h-2/3',
  '25%': 'h-1/4',
  '75%': 'h-3/4',
  '20%': 'h-1/5',
  '40%': 'h-2/5',
  '60%': 'h-3/5',
  '80%': 'h-4/5',
  '16.666667%': 'h-1/6',
  '83.333333%': 'h-5/6',
};

// ---------------------------------------------------------------------------
// Min/Max width/height
// ---------------------------------------------------------------------------
const MIN_WIDTH_VALUES: Record<string, string> = {
  '0': 'min-w-0',
  '0px': 'min-w-0',
  '100%': 'min-w-full',
  'min-content': 'min-w-min',
  'max-content': 'min-w-max',
  'fit-content': 'min-w-fit',
};

const MAX_WIDTH_VALUES: Record<string, string> = {
  'none': 'max-w-none',
  '0': 'max-w-0',
  '0px': 'max-w-0',
  '20rem': 'max-w-xs',
  '24rem': 'max-w-sm',
  '28rem': 'max-w-md',
  '32rem': 'max-w-lg',
  '36rem': 'max-w-xl',
  '42rem': 'max-w-2xl',
  '48rem': 'max-w-3xl',
  '56rem': 'max-w-4xl',
  '64rem': 'max-w-5xl',
  '72rem': 'max-w-6xl',
  '80rem': 'max-w-7xl',
  '100%': 'max-w-full',
  'min-content': 'max-w-min',
  'max-content': 'max-w-max',
  'fit-content': 'max-w-fit',
  '65ch': 'max-w-prose',
};

const MIN_HEIGHT_VALUES: Record<string, string> = {
  '0': 'min-h-0',
  '0px': 'min-h-0',
  '100%': 'min-h-full',
  '100vh': 'min-h-screen',
  'min-content': 'min-h-min',
  'max-content': 'min-h-max',
  'fit-content': 'min-h-fit',
};

const MAX_HEIGHT_VALUES: Record<string, string> = {
  'none': 'max-h-none',
  '100%': 'max-h-full',
  '100vh': 'max-h-screen',
  'min-content': 'max-h-min',
  'max-content': 'max-h-max',
  'fit-content': 'max-h-fit',
};

// ---------------------------------------------------------------------------
// Z-index
// ---------------------------------------------------------------------------
const Z_INDEX: Record<string, string> = {
  '0': 'z-0',
  '10': 'z-10',
  '20': 'z-20',
  '30': 'z-30',
  '40': 'z-40',
  '50': 'z-50',
  'auto': 'z-auto',
};

// ---------------------------------------------------------------------------
// Object fit
// ---------------------------------------------------------------------------
const OBJECT_FIT: Record<string, string> = {
  'contain': 'object-contain',
  'cover': 'object-cover',
  'fill': 'object-fill',
  'none': 'object-none',
  'scale-down': 'object-scale-down',
};

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------
const CURSOR: Record<string, string> = {
  'auto': 'cursor-auto',
  'default': 'cursor-default',
  'pointer': 'cursor-pointer',
  'wait': 'cursor-wait',
  'text': 'cursor-text',
  'move': 'cursor-move',
  'help': 'cursor-help',
  'not-allowed': 'cursor-not-allowed',
  'none': 'cursor-none',
  'crosshair': 'cursor-crosshair',
  'grab': 'cursor-grab',
  'grabbing': 'cursor-grabbing',
};

// ---------------------------------------------------------------------------
// Border style
// ---------------------------------------------------------------------------
const BORDER_STYLE: Record<string, string> = {
  'solid': 'border-solid',
  'dashed': 'border-dashed',
  'dotted': 'border-dotted',
  'double': 'border-double',
  'none': 'border-none',
  'hidden': 'border-hidden',
};

// ---------------------------------------------------------------------------
// Tailwind default color palette
// All RGB values for shades 50..950
// ---------------------------------------------------------------------------
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
      entries.push({
        name,
        shade: Number(shade),
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
      });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Color parsing utilities
// ---------------------------------------------------------------------------

function parseColor(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();

  // Named colors
  if (v === 'transparent') return null;
  if (v === 'white') return [255, 255, 255];
  if (v === 'black') return [0, 0, 0];
  if (v === 'inherit' || v === 'initial' || v === 'unset' || v === 'currentcolor') return null;

  // hex: #rgb, #rrggbb, #rgba, #rrggbbaa
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

  // rgb(r, g, b) or rgb(r g b) or rgba(r, g, b, a)
  const rgbMatch = v.match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/);
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1]!, 10),
      parseInt(rgbMatch[2]!, 10),
      parseInt(rgbMatch[3]!, 10),
    ];
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

function findTailwindColor(rgb: [number, number, number]): string | null {
  // Check exact named colors first
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

// ---------------------------------------------------------------------------
// CSS property -> prefix mapping for spacing properties
// ---------------------------------------------------------------------------
const SPACING_PREFIX_MAP: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// Helpers: detect spacing-based Tailwind classes
// ---------------------------------------------------------------------------

/**
 * Check if a class is a spacing-based class with the given prefix.
 * Handles named scale values (e.g. pt-4) and arbitrary values (e.g. pt-[13px]).
 */
function isSpacingClass(cls: string, prefix: string): boolean {
  if (!cls.startsWith(`${prefix}-`)) return false;
  const suffix = cls.slice(prefix.length + 1);
  if (suffix.startsWith('[') && suffix.endsWith(']')) return true;
  if (suffix === 'auto') return true;
  if (suffix === 'px') return true;
  return /^(\d+(\.\d+)?)$/.test(suffix);
}

// ---------------------------------------------------------------------------
// Color class detection helpers
// ---------------------------------------------------------------------------

const COLOR_NAMES_RE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

// Pattern for text color classes: text-{color}-{shade} or text-white/black/transparent
const TEXT_COLOR_RE = new RegExp(
  `^text-(${COLOR_NAMES_RE})-\\d+$|^text-(white|black|transparent|inherit|current)$|^text-\\[#[0-9a-fA-F]+\\]$|^text-\\[rgb`
);

// Pattern for bg color classes
const BG_COLOR_RE = new RegExp(
  `^bg-(${COLOR_NAMES_RE})-\\d+$|^bg-(white|black|transparent|inherit|current)$|^bg-\\[#[0-9a-fA-F]+\\]$|^bg-\\[rgb`
);

// Pattern for border color classes
const BORDER_COLOR_RE = new RegExp(
  `^border-(${COLOR_NAMES_RE})-\\d+$|^border-(white|black|transparent|inherit|current)$|^border-\\[#[0-9a-fA-F]+\\]$|^border-\\[rgb`
);

// Pattern for text-size classes (not color)
const TEXT_SIZE_RE = /^text-(xs|sm|base|lg|xl|[2-9]xl|\[.+\])$/;

/**
 * Test whether a class is a text-color class (not font-size or text-align).
 */
function isTextColorClass(cls: string): boolean {
  if (!cls.startsWith('text-')) return false;
  // Exclude text-size and text-align classes
  if (FONT_SIZE_CLASSES.has(cls)) return false;
  if (TEXT_ALIGN_CLASSES.has(cls)) return false;
  if (TEXT_SIZE_RE.test(cls)) return false;
  // It starts with text- and is not size or align, so it is a color class
  return TEXT_COLOR_RE.test(cls) || /^text-\[.+\]$/.test(cls);
}

/**
 * Test whether a class is a bg-color class.
 */
function isBgColorClass(cls: string): boolean {
  return BG_COLOR_RE.test(cls) || /^bg-\[.+\]$/.test(cls);
}

/**
 * Test whether a class is a border-color class.
 */
function isBorderColorClass(cls: string): boolean {
  if (!cls.startsWith('border-')) return false;
  // Exclude border-width classes
  if (BORDER_WIDTH_CLASSES.has(cls)) return false;
  // Exclude border-style classes
  if (cls === 'border-solid' || cls === 'border-dashed' || cls === 'border-dotted' ||
      cls === 'border-double' || cls === 'border-none' || cls === 'border-hidden') return false;
  return BORDER_COLOR_RE.test(cls);
}

// ---------------------------------------------------------------------------
// Arbitrary value formatting
// ---------------------------------------------------------------------------

function formatArbitraryValue(value: string): string {
  return value.replace(/\s+/g, '_');
}

// ---------------------------------------------------------------------------
// Main: cssToTailwind
// ---------------------------------------------------------------------------

/**
 * Given a CSS property (camelCase) and its value, return the corresponding
 * Tailwind utility class. Returns null if the property is not supported.
 *
 * For values that do not match a standard Tailwind class, arbitrary value
 * syntax is used (e.g. `text-[17px]`).
 */
export function cssToTailwind(property: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  switch (property) {
    // --- Font size ---
    case 'fontSize': {
      const mapped = FONT_SIZES[v];
      if (mapped) return mapped;
      return `text-[${formatArbitraryValue(v)}]`;
    }

    // --- Font weight ---
    case 'fontWeight': {
      const mapped = FONT_WEIGHTS[v];
      if (mapped) return mapped;
      return `font-[${formatArbitraryValue(v)}]`;
    }

    // --- Font style ---
    case 'fontStyle': {
      const mapped = FONT_STYLE[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Text decoration ---
    case 'textDecoration':
    case 'textDecorationLine': {
      const mapped = TEXT_DECORATION[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Text transform ---
    case 'textTransform': {
      const mapped = TEXT_TRANSFORM[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Text alignment ---
    case 'textAlign': {
      const mapped = TEXT_ALIGN[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Line height ---
    case 'lineHeight': {
      const mapped = LINE_HEIGHT[v];
      if (mapped) return mapped;
      return `leading-[${formatArbitraryValue(v)}]`;
    }

    // --- Letter spacing ---
    case 'letterSpacing': {
      const mapped = LETTER_SPACING[v];
      if (mapped) return mapped;
      return `tracking-[${formatArbitraryValue(v)}]`;
    }

    // --- Color (text color) ---
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

    // --- Background color ---
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

    // --- Border color ---
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

    // --- Border width ---
    case 'borderWidth': {
      const mapped = BORDER_WIDTH[v];
      if (mapped) return mapped;
      return `border-[${formatArbitraryValue(v)}]`;
    }

    // --- Border style ---
    case 'borderStyle': {
      const mapped = BORDER_STYLE[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Border radius (all corners) ---
    case 'borderRadius': {
      const mapped = BORDER_RADIUS[v];
      if (mapped) return mapped;
      return `rounded-[${formatArbitraryValue(v)}]`;
    }

    // --- Border radius per-corner ---
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

    // --- Display ---
    case 'display': {
      const mapped = DISPLAY[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Flex direction ---
    case 'flexDirection': {
      const mapped = FLEX_DIRECTION[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Flex wrap ---
    case 'flexWrap': {
      const mapped = FLEX_WRAP[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Align items ---
    case 'alignItems': {
      const mapped = ALIGN_ITEMS[v];
      if (mapped) return mapped;
      return `items-[${formatArbitraryValue(v)}]`;
    }

    // --- Justify content ---
    case 'justifyContent': {
      const mapped = JUSTIFY_CONTENT[v];
      if (mapped) return mapped;
      return `justify-[${formatArbitraryValue(v)}]`;
    }

    // --- Opacity ---
    case 'opacity': {
      const mapped = OPACITY[v];
      if (mapped) return mapped;
      return `opacity-[${formatArbitraryValue(v)}]`;
    }

    // --- Position ---
    case 'position': {
      const mapped = POSITION[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Overflow ---
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

    // --- Width ---
    case 'width': {
      const kw = WIDTH_VALUES[v];
      if (kw) return kw;
      const sp = SPACING_SCALE[v];
      if (sp) return `w-${sp}`;
      return `w-[${formatArbitraryValue(v)}]`;
    }

    // --- Height ---
    case 'height': {
      const kw = HEIGHT_VALUES[v];
      if (kw) return kw;
      const sp = SPACING_SCALE[v];
      if (sp) return `h-${sp}`;
      return `h-[${formatArbitraryValue(v)}]`;
    }

    // --- Min/Max width/height ---
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

    // --- Z-index ---
    case 'zIndex': {
      const mapped = Z_INDEX[v];
      if (mapped) return mapped;
      return `z-[${formatArbitraryValue(v)}]`;
    }

    // --- Object fit ---
    case 'objectFit': {
      const mapped = OBJECT_FIT[v];
      if (mapped) return mapped;
      return null;
    }

    // --- Cursor ---
    case 'cursor': {
      const mapped = CURSOR[v];
      if (mapped) return mapped;
      return `cursor-[${formatArbitraryValue(v)}]`;
    }

    // --- Flex grow/shrink ---
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

    // --- Flex basis ---
    case 'flexBasis': {
      if (v === 'auto') return 'basis-auto';
      if (v === '100%') return 'basis-full';
      const sp = SPACING_SCALE[v];
      if (sp) return `basis-${sp}`;
      return `basis-[${formatArbitraryValue(v)}]`;
    }

    // --- Align self ---
    case 'alignSelf': {
      const map: Record<string, string> = {
        'auto': 'self-auto',
        'flex-start': 'self-start',
        'start': 'self-start',
        'center': 'self-center',
        'flex-end': 'self-end',
        'end': 'self-end',
        'stretch': 'self-stretch',
        'baseline': 'self-baseline',
      };
      return map[v] ?? null;
    }

    // --- White space ---
    case 'whiteSpace': {
      const map: Record<string, string> = {
        'normal': 'whitespace-normal',
        'nowrap': 'whitespace-nowrap',
        'pre': 'whitespace-pre',
        'pre-line': 'whitespace-pre-line',
        'pre-wrap': 'whitespace-pre-wrap',
        'break-spaces': 'whitespace-break-spaces',
      };
      return map[v] ?? null;
    }

    // --- Word break ---
    case 'wordBreak': {
      if (v === 'break-all') return 'break-all';
      if (v === 'keep-all') return 'break-keep';
      if (v === 'normal') return 'break-normal';
      return null;
    }

    // --- Overflow wrap ---
    case 'overflowWrap': {
      if (v === 'break-word') return 'break-words';
      if (v === 'normal') return 'break-normal';
      return null;
    }

    // --- Box shadow ---
    case 'boxShadow': {
      if (v === 'none') return 'shadow-none';
      return `shadow-[${formatArbitraryValue(v)}]`;
    }

    // --- Transition ---
    case 'transitionProperty': {
      const map: Record<string, string> = {
        'none': 'transition-none',
        'all': 'transition-all',
        'opacity': 'transition-opacity',
        'box-shadow': 'transition-shadow',
        'transform': 'transition-transform',
      };
      return map[v] ?? null;
    }

    // --- Grid template columns ---
    case 'gridTemplateColumns': {
      const colMatch = v.match(/^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/);
      if (colMatch) return `grid-cols-${colMatch[1]}`;
      if (v === 'none') return 'grid-cols-none';
      if (v === 'subgrid') return 'grid-cols-subgrid';
      return `grid-cols-[${formatArbitraryValue(v)}]`;
    }

    // --- Grid template rows ---
    case 'gridTemplateRows': {
      const rowMatch = v.match(/^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/);
      if (rowMatch) return `grid-rows-${rowMatch[1]}`;
      if (v === 'none') return 'grid-rows-none';
      if (v === 'subgrid') return 'grid-rows-subgrid';
      return `grid-rows-[${formatArbitraryValue(v)}]`;
    }

    // --- Grid column span ---
    case 'gridColumn': {
      const spanMatch = v.match(/^span\s+(\d+)\s*\/\s*span\s+(\d+)$/);
      if (spanMatch) return `col-span-${spanMatch[1]}`;
      if (v === '1 / -1') return 'col-span-full';
      return `col-[${formatArbitraryValue(v)}]`;
    }

    // --- Grid row span ---
    case 'gridRow': {
      const spanMatch = v.match(/^span\s+(\d+)\s*\/\s*span\s+(\d+)$/);
      if (spanMatch) return `row-span-${spanMatch[1]}`;
      if (v === '1 / -1') return 'row-span-full';
      return `row-[${formatArbitraryValue(v)}]`;
    }

    default:
      break;
  }

  // --- Spacing properties (padding, margin, gap, inset, top/right/bottom/left) ---
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

// ---------------------------------------------------------------------------
// getTailwindPropertyGroup
// ---------------------------------------------------------------------------

/**
 * Returns the Tailwind class prefix group for a CSS property, used to find
 * and replace existing classes when a property value changes.
 */
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

// ---------------------------------------------------------------------------
// isClassInGroup
// ---------------------------------------------------------------------------

/**
 * Checks if a Tailwind class belongs to a CSS property group.
 * This is essential for correctly identifying which class to replace when
 * a property value changes, especially for ambiguous prefixes like `text-`
 * which is shared by font size, text color, and text alignment.
 */
export function isClassInGroup(className: string, group: string): boolean {
  const cls = className.trim();

  switch (group) {
    // --- Font size: text-xs, text-sm, ..., text-9xl, text-[...] (but NOT text-color or text-align) ---
    case 'fontSize':
      if (FONT_SIZE_CLASSES.has(cls)) return true;
      // Arbitrary font size: text-[<value>] where value looks like a size (contains px, rem, em, etc.)
      if (TEXT_SIZE_RE.test(cls)) return true;
      return false;

    // --- Font weight ---
    case 'fontWeight':
      if (FONT_WEIGHT_CLASSES.has(cls)) return true;
      return /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[.+\])$/.test(cls);

    // --- Font style ---
    case 'fontStyle':
      return cls === 'italic' || cls === 'not-italic';

    // --- Text decoration ---
    case 'textDecoration':
    case 'textDecorationLine':
      return cls === 'underline' || cls === 'overline' || cls === 'line-through' || cls === 'no-underline';

    // --- Text transform ---
    case 'textTransform':
      return cls === 'uppercase' || cls === 'lowercase' || cls === 'capitalize' || cls === 'normal-case';

    // --- Text alignment ---
    case 'textAlign':
      return TEXT_ALIGN_CLASSES.has(cls);

    // --- Line height ---
    case 'lineHeight':
      if (LINE_HEIGHT_CLASSES.has(cls)) return true;
      return /^leading-\[.+\]$/.test(cls);

    // --- Letter spacing ---
    case 'letterSpacing':
      if (LETTER_SPACING_CLASSES.has(cls)) return true;
      return /^tracking-\[.+\]$/.test(cls);

    // --- Text color ---
    case 'color':
      return isTextColorClass(cls);

    // --- Background color ---
    case 'backgroundColor':
      return isBgColorClass(cls);

    // --- Border color ---
    case 'borderColor':
      return isBorderColorClass(cls);

    // --- Border width ---
    case 'borderWidth':
      if (BORDER_WIDTH_CLASSES.has(cls)) return true;
      return false;

    // --- Border style ---
    case 'borderStyle':
      return /^border-(solid|dashed|dotted|double|none|hidden)$/.test(cls);

    // --- Border radius ---
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

    // --- Display ---
    case 'display':
      return DISPLAY_CLASSES.has(cls);

    // --- Flex direction ---
    case 'flexDirection':
      return FLEX_DIRECTION_CLASSES.has(cls);

    // --- Flex wrap ---
    case 'flexWrap':
      return FLEX_WRAP_CLASSES.has(cls);

    // --- Align items ---
    case 'alignItems':
      if (ALIGN_ITEMS_CLASSES.has(cls)) return true;
      return /^items-\[.+\]$/.test(cls);

    // --- Justify content ---
    case 'justifyContent':
      if (JUSTIFY_CONTENT_CLASSES.has(cls)) return true;
      return /^justify-\[.+\]$/.test(cls);

    // --- Align self ---
    case 'alignSelf':
      return /^self-(auto|start|center|end|stretch|baseline)$/.test(cls);

    // --- Opacity ---
    case 'opacity':
      if (OPACITY_CLASSES.has(cls)) return true;
      return /^opacity-\[.+\]$/.test(cls);

    // --- Position ---
    case 'position':
      return POSITION_CLASSES.has(cls);

    // --- Overflow ---
    case 'overflow':
      return /^overflow-(auto|hidden|visible|scroll|clip)$/.test(cls);
    case 'overflowX':
      return /^overflow-x-(auto|hidden|visible|scroll|clip)$/.test(cls);
    case 'overflowY':
      return /^overflow-y-(auto|hidden|visible|scroll|clip)$/.test(cls);

    // --- Width ---
    case 'width':
      return /^w-/.test(cls);
    // --- Height ---
    case 'height':
      return /^h-/.test(cls);
    // --- Min/Max width/height ---
    case 'minWidth':
      return /^min-w-/.test(cls);
    case 'maxWidth':
      return /^max-w-/.test(cls);
    case 'minHeight':
      return /^min-h-/.test(cls);
    case 'maxHeight':
      return /^max-h-/.test(cls);

    // --- Z-index ---
    case 'zIndex':
      return /^z-(0|10|20|30|40|50|auto|\[.+\])$/.test(cls);

    // --- Object fit ---
    case 'objectFit':
      return /^object-(contain|cover|fill|none|scale-down)$/.test(cls);

    // --- Cursor ---
    case 'cursor':
      return /^cursor-/.test(cls);

    // --- Flex grow ---
    case 'flexGrow':
      return cls === 'grow' || cls === 'grow-0' || /^grow-\[.+\]$/.test(cls);

    // --- Flex shrink ---
    case 'flexShrink':
      return cls === 'shrink' || cls === 'shrink-0' || /^shrink-\[.+\]$/.test(cls);

    // --- Flex basis ---
    case 'flexBasis':
      return /^basis-/.test(cls);

    // --- White space ---
    case 'whiteSpace':
      return /^whitespace-/.test(cls);

    // --- Word break / overflow wrap ---
    case 'wordBreak':
    case 'overflowWrap':
      return /^break-(normal|words|all|keep)$/.test(cls);

    // --- Box shadow ---
    case 'boxShadow':
      return /^shadow(-|$)/.test(cls) &&
        !new RegExp(`^shadow-(${COLOR_NAMES_RE})`).test(cls);

    // --- Transition ---
    case 'transitionProperty':
      return /^transition(-|$)/.test(cls);

    // --- Grid ---
    case 'gridTemplateColumns':
      return /^grid-cols-/.test(cls);
    case 'gridTemplateRows':
      return /^grid-rows-/.test(cls);
    case 'gridColumn':
      return /^col-/.test(cls);
    case 'gridRow':
      return /^row-/.test(cls);

    // --- Spacing properties ---
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

// ---------------------------------------------------------------------------
// Convenience: updateClassList
// Replaces the class for a given CSS property in a class list string.
// ---------------------------------------------------------------------------

/**
 * Given an existing class list string, a CSS property, and a new value,
 * returns a new class list with the old class for that property replaced
 * by the new one.
 */
export function updateClassList(
  existingClasses: string,
  property: string,
  value: string,
): string {
  const newClass = cssToTailwind(property, value);
  if (!newClass) return existingClasses;

  const classes = existingClasses.split(/\s+/).filter(Boolean);

  // Remove any existing class in the same group
  const filtered = classes.filter((cls) => !isClassInGroup(cls, property));

  // Add the new class
  filtered.push(newClass);

  return filtered.join(' ');
}

// ---------------------------------------------------------------------------
// Convenience: removePropertyClasses
// Removes all classes for a given CSS property from a class list string.
// ---------------------------------------------------------------------------

/**
 * Removes all Tailwind classes associated with the given CSS property
 * from the class list string.
 */
export function removePropertyClasses(
  existingClasses: string,
  property: string,
): string {
  const classes = existingClasses.split(/\s+/).filter(Boolean);
  const filtered = classes.filter((cls) => !isClassInGroup(cls, property));
  return filtered.join(' ');
}
