// =============================================================================
// Tailwind CSS Dimension & Box-Model Constants
// Border width, width/height values, z-index, object-fit, cursor, border-style
// =============================================================================

export const BORDER_WIDTH: Record<string, string> = {
  '0': 'border-0',
  '0px': 'border-0',
  '1px': 'border',
  '2px': 'border-2',
  '4px': 'border-4',
  '8px': 'border-8',
};

export const BORDER_WIDTH_CLASSES = new Set([
  'border-0', 'border', 'border-2', 'border-4', 'border-8',
]);

export const WIDTH_VALUES: Record<string, string> = {
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

export const HEIGHT_VALUES: Record<string, string> = {
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

export const MIN_WIDTH_VALUES: Record<string, string> = {
  '0': 'min-w-0',
  '0px': 'min-w-0',
  '100%': 'min-w-full',
  'min-content': 'min-w-min',
  'max-content': 'min-w-max',
  'fit-content': 'min-w-fit',
};

export const MAX_WIDTH_VALUES: Record<string, string> = {
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

export const MIN_HEIGHT_VALUES: Record<string, string> = {
  '0': 'min-h-0',
  '0px': 'min-h-0',
  '100%': 'min-h-full',
  '100vh': 'min-h-screen',
  'min-content': 'min-h-min',
  'max-content': 'min-h-max',
  'fit-content': 'min-h-fit',
};

export const MAX_HEIGHT_VALUES: Record<string, string> = {
  'none': 'max-h-none',
  '100%': 'max-h-full',
  '100vh': 'max-h-screen',
  'min-content': 'max-h-min',
  'max-content': 'max-h-max',
  'fit-content': 'max-h-fit',
};

export const Z_INDEX: Record<string, string> = {
  '0': 'z-0',
  '10': 'z-10',
  '20': 'z-20',
  '30': 'z-30',
  '40': 'z-40',
  '50': 'z-50',
  'auto': 'z-auto',
};

export const OBJECT_FIT: Record<string, string> = {
  'contain': 'object-contain',
  'cover': 'object-cover',
  'fill': 'object-fill',
  'none': 'object-none',
  'scale-down': 'object-scale-down',
};

export const CURSOR: Record<string, string> = {
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

export const BORDER_STYLE: Record<string, string> = {
  'solid': 'border-solid',
  'dashed': 'border-dashed',
  'dotted': 'border-dotted',
  'double': 'border-double',
  'none': 'border-none',
  'hidden': 'border-hidden',
};
