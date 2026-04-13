// =============================================================================
// Tailwind CSS Typography Scale Constants
// =============================================================================

export const FONT_SIZES: Record<string, string> = {
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

export const FONT_SIZE_CLASSES = new Set([
  'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl',
  'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl',
  'text-7xl', 'text-8xl', 'text-9xl',
]);

export const FONT_WEIGHTS: Record<string, string> = {
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

export const FONT_WEIGHT_CLASSES = new Set([
  'font-thin', 'font-extralight', 'font-light', 'font-normal',
  'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black',
]);

export const FONT_STYLE: Record<string, string> = {
  'italic': 'italic',
  'normal': 'not-italic',
};

export const TEXT_DECORATION: Record<string, string> = {
  'underline': 'underline',
  'overline': 'overline',
  'line-through': 'line-through',
  'none': 'no-underline',
};

export const TEXT_TRANSFORM: Record<string, string> = {
  'uppercase': 'uppercase',
  'lowercase': 'lowercase',
  'capitalize': 'capitalize',
  'none': 'normal-case',
};

export const TEXT_ALIGN: Record<string, string> = {
  'left': 'text-left',
  'center': 'text-center',
  'right': 'text-right',
  'justify': 'text-justify',
};

export const TEXT_ALIGN_CLASSES = new Set([
  'text-left', 'text-center', 'text-right', 'text-justify',
]);

export const LINE_HEIGHT: Record<string, string> = {
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

export const LINE_HEIGHT_CLASSES = new Set([
  'leading-none', 'leading-tight', 'leading-snug', 'leading-normal',
  'leading-relaxed', 'leading-loose', 'leading-3', 'leading-4',
  'leading-5', 'leading-6', 'leading-7', 'leading-8', 'leading-9', 'leading-10',
]);

export const LETTER_SPACING: Record<string, string> = {
  '-0.05em': 'tracking-tighter',
  '-0.025em': 'tracking-tight',
  '0': 'tracking-normal',
  '0em': 'tracking-normal',
  '0.025em': 'tracking-wide',
  '0.05em': 'tracking-wider',
  '0.1em': 'tracking-widest',
};

export const LETTER_SPACING_CLASSES = new Set([
  'tracking-tighter', 'tracking-tight', 'tracking-normal',
  'tracking-wide', 'tracking-wider', 'tracking-widest',
]);
