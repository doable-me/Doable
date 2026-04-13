// =============================================================================
// Tailwind CSS Layout Scale Constants
// Spacing, display, flex, position, overflow, etc.
// =============================================================================

export const SPACING_SCALE: Record<string, string> = {
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

export const BORDER_RADIUS: Record<string, string> = {
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

export const BORDER_RADIUS_CLASSES = new Set([
  'rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg',
  'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full',
]);

export const DISPLAY: Record<string, string> = {
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

export const DISPLAY_CLASSES = new Set([
  'block', 'inline-block', 'inline', 'flex', 'inline-flex',
  'grid', 'inline-grid', 'hidden', 'table', 'table-row',
  'table-cell', 'contents', 'list-item',
]);

export const FLEX_DIRECTION: Record<string, string> = {
  'row': 'flex-row',
  'row-reverse': 'flex-row-reverse',
  'column': 'flex-col',
  'column-reverse': 'flex-col-reverse',
};

export const FLEX_DIRECTION_CLASSES = new Set([
  'flex-row', 'flex-row-reverse', 'flex-col', 'flex-col-reverse',
]);

export const FLEX_WRAP: Record<string, string> = {
  'wrap': 'flex-wrap',
  'nowrap': 'flex-nowrap',
  'wrap-reverse': 'flex-wrap-reverse',
};

export const FLEX_WRAP_CLASSES = new Set([
  'flex-wrap', 'flex-nowrap', 'flex-wrap-reverse',
]);

export const ALIGN_ITEMS: Record<string, string> = {
  'flex-start': 'items-start',
  'start': 'items-start',
  'center': 'items-center',
  'flex-end': 'items-end',
  'end': 'items-end',
  'stretch': 'items-stretch',
  'baseline': 'items-baseline',
};

export const ALIGN_ITEMS_CLASSES = new Set([
  'items-start', 'items-center', 'items-end', 'items-stretch', 'items-baseline',
]);

export const JUSTIFY_CONTENT: Record<string, string> = {
  'flex-start': 'justify-start',
  'start': 'justify-start',
  'center': 'justify-center',
  'flex-end': 'justify-end',
  'end': 'justify-end',
  'space-between': 'justify-between',
  'space-around': 'justify-around',
  'space-evenly': 'justify-evenly',
};

export const JUSTIFY_CONTENT_CLASSES = new Set([
  'justify-start', 'justify-center', 'justify-end',
  'justify-between', 'justify-around', 'justify-evenly',
]);

export const OPACITY: Record<string, string> = {
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

export const OPACITY_CLASSES = new Set([
  'opacity-0', 'opacity-5', 'opacity-10', 'opacity-15', 'opacity-20',
  'opacity-25', 'opacity-30', 'opacity-35', 'opacity-40', 'opacity-45',
  'opacity-50', 'opacity-55', 'opacity-60', 'opacity-65', 'opacity-70',
  'opacity-75', 'opacity-80', 'opacity-85', 'opacity-90', 'opacity-95',
  'opacity-100',
]);

export const POSITION: Record<string, string> = {
  'static': 'static',
  'fixed': 'fixed',
  'absolute': 'absolute',
  'relative': 'relative',
  'sticky': 'sticky',
};

export const POSITION_CLASSES = new Set([
  'static', 'fixed', 'absolute', 'relative', 'sticky',
]);

export const OVERFLOW: Record<string, string> = {
  'auto': 'overflow-auto',
  'hidden': 'overflow-hidden',
  'visible': 'overflow-visible',
  'scroll': 'overflow-scroll',
  'clip': 'overflow-clip',
};

export const OVERFLOW_X: Record<string, string> = {
  'auto': 'overflow-x-auto',
  'hidden': 'overflow-x-hidden',
  'visible': 'overflow-x-visible',
  'scroll': 'overflow-x-scroll',
  'clip': 'overflow-x-clip',
};

export const OVERFLOW_Y: Record<string, string> = {
  'auto': 'overflow-y-auto',
  'hidden': 'overflow-y-hidden',
  'visible': 'overflow-y-visible',
  'scroll': 'overflow-y-scroll',
  'clip': 'overflow-y-clip',
};
