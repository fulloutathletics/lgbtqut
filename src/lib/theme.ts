// Each theme supplies a header treatment (`bar`), an accent, and a card tint.
// Accent drives buttons, active nav, verified badges, links and toggles.

export interface Theme {
  label: string
  group: 'standard' | 'pride'
  bar: string
  accent: string
  tint: string
  img: string
  dot: string
}

const solid = (label: string, hex: string, tint: string): Theme => ({
  label, bar: hex, accent: hex, tint, img: '', group: 'standard', dot: hex,
})

export const THEMES: Record<string, Theme> = {
  Red: solid('Red', '#D62839', '#FBF0F1'),
  Orange: solid('Orange', '#DD6317', '#FDF3EC'),
  Yellow: solid('Yellow', '#D19A00', '#FCF6E6'),
  Green: solid('Green', '#2E8B45', '#EDF6F0'),
  Blue: solid('Blue', '#1F6FD0', '#EDF3FC'),
  Indigo: solid('Indigo', '#4B3FBF', '#F0EFFB'),
  Violet: solid('Violet', '#8E2FA8', '#F7EEFA'),
  Rainbow: {
    label: 'LGBTQ', group: 'pride', accent: '#7A2FA6', tint: '#F6F1FA', img: '',
    bar: 'linear-gradient(100deg,#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787)',
    dot: 'conic-gradient(#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787,#E40303)',
  },
  Trans: {
    label: 'Trans', group: 'pride', accent: '#2C86B5', tint: '#EDF7FC', img: '',
    bar: 'linear-gradient(170deg,#5BCEFA 0%,#5BCEFA 22%,#F5A9B8 22%,#F5A9B8 40%,#FFFFFF 40%,#FFFFFF 60%,#F5A9B8 60%,#F5A9B8 78%,#5BCEFA 78%)',
    dot: 'linear-gradient(180deg,#5BCEFA 0 20%,#F5A9B8 20% 40%,#FFF 40% 60%,#F5A9B8 60% 80%,#5BCEFA 80%)',
  },
  Bi: {
    label: 'Bi', group: 'pride', accent: '#9B4F96', tint: '#F8F0F7', img: '',
    bar: 'linear-gradient(100deg,#D60270 0%,#D60270 38%,#9B4F96 38%,#9B4F96 62%,#0038A8 62%)',
    dot: 'linear-gradient(180deg,#D60270 0 40%,#9B4F96 40% 60%,#0038A8 60%)',
  },
  MLM: {
    label: 'MLM', group: 'pride', accent: '#2A7F70', tint: '#EDF7F4', img: '',
    bar: 'linear-gradient(170deg,#078D70 0%,#078D70 14%,#26CEAA 14% 28%,#98E8C1 28% 42%,#FFFFFF 42% 58%,#7BADE2 58% 72%,#5049CC 72% 86%,#3D1A78 86%)',
    dot: 'linear-gradient(180deg,#078D70 0 20%,#26CEAA 20% 35%,#98E8C1 35% 45%,#FFF 45% 55%,#7BADE2 55% 65%,#5049CC 65% 80%,#3D1A78 80%)',
  },
  Asexual: {
    label: 'Asexual', group: 'pride', accent: '#6B2E7A', tint: '#F5F0F7', img: '',
    bar: 'linear-gradient(170deg,#0B0B0B 0 25%,#A3A3A3 25% 50%,#FFFFFF 50% 75%,#800080 75%)',
    dot: 'linear-gradient(180deg,#0B0B0B 0 25%,#A3A3A3 25% 50%,#FFF 50% 75%,#800080 75%)',
  },
  RoyGBiv: {
    label: 'Roy G. Biv', group: 'pride', accent: '#C2453B', tint: '#FBF1EF',
    bar: 'linear-gradient(100deg,#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787)',
    img: 'https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/PyKovGOpnILilVzStEZB/pub/iNXLWnThIJyawaZztX4U.png',
    dot: 'conic-gradient(#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787,#E40303)',
  },
}

export const DEFAULT_THEME = 'Rainbow'

/** Fallback swatches for categories and communities, which have no artwork yet. */
export const SWATCH = ['#5B4B8A', '#2F6E63', '#9A4A5C', '#3E5C8A', '#8A5A2F', '#4A6B4E', '#6E4A7A', '#2F5B6E']

/** Section card dimensions, keyed `${size}-${orient}`. */
export const SIZES: Record<string, [string, string]> = {
  'large-horizontal': ['294px', '198px'],
  'medium-horizontal': ['214px', '142px'],
  'small-horizontal': ['150px', '100px'],
  'large-vertical': ['186px', '256px'],
  'medium-vertical': ['150px', '206px'],
  'large-full': ['auto', '206px'],
  'medium-full': ['auto', '150px'],
  'large-tile': ['auto', '128px'],
  'medium-tile': ['auto', '104px'],
}

export const FONT = 'Garet, Outfit, -apple-system, system-ui, sans-serif'

export const C = {
  ink: '#141413',
  body: '#3D3C39',
  muted: '#89857E',
  faint: '#A19D95',
  hairline: '#F3F0EC',
  border: '#EDEAE5',
  fill: '#F3F1ED',
  crisis: '#E4373C',
  crisisBg: '#1C1B1A',
  danger: '#B4494E',
  dangerBg: '#FBF3F3',
  success: '#2E8B5F',
  successBg: '#F2F8F5',
  agePill: '#7A6E58',
  agePillBg: '#EFEBE4',
}
