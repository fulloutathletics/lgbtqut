interface IconProps { size?: number; color?: string; width?: number }

export const Chevron = ({ size = 16, color = '#8A8680', width = 2.4 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={width} strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
)

export const ChevronDown = ({ size = 16, color = '#8A8680', width = 2.4 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={width} strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
)

export const Back = ({ size = 17, color = '#2A2A28' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
)

export const Alert = ({ size = 20, color = '#fff' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={2.2} strokeLinecap="round"><path d="M12 8v5" /><path d="M12 17h.01" /></svg>
)

export const Search = ({ size = 16, color = '#938F88' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={2.2} strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" />
  </svg>
)

export const Heart = ({ size = 20, filled = false, color = '#8A8680' }: IconProps & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color}
       strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21.2l7.7-7.8 1.1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
)

/** Scalloped seal filled with the theme accent. */
export const Verified = ({ size = 15, color = '#7A2FA6' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: 'none', verticalAlign: '-2px' }}>
    <path fill={color} d="M12 1.5l2.4 1.9 3-.4 1.2 2.8 2.7 1.4-.7 3 1.9 2.4-1.9 2.4.7 3-2.7 1.4-1.2 2.8-3-.4L12 22.5l-2.4-1.9-3 .4-1.2-2.8-2.7-1.4.7-3L1.5 11.4l1.9-2.4-.7-3 2.7-1.4L6.6 1.8l3 .4z" />
    <path d="M8 12.2l2.6 2.6L16 9.4" fill="none" stroke="#fff" strokeWidth="2.1"
          strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Star = ({ size = 20, filled = false, color = '#D19A00' }: IconProps & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.8}>
    <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
          strokeLinejoin="round" />
  </svg>
)

export const Share = ({ size = 17, color = '#2A2A28' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <path d="M16 6l-4-4-4 4" /><path d="M12 2v13" />
  </svg>
)

export const Camera = ({ size = 15, color = '#fff' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8h3l1.6-2.4A2 2 0 0 1 10.3 4.6h3.4a2 2 0 0 1 1.7 1L17 8h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8z" />
    <circle cx="12" cy="13.6" r="3.4" />
  </svg>
)

export const Pencil = ({ size = 15, color = '#2A2A28' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h4l10.5-10.5a2.83 2.83 0 0 0-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
)

export const Nav = {
  resources: (c: string) => (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 1 4 16z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 0 20 16z" />
    </svg>
  ),
  events: (c: string) => (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  shop: (c: string) => (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h16l-1.2 11.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z" /><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
    </svg>
  ),
  profile: (c: string) => (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  ),
  feed: (c: string) => (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
}
