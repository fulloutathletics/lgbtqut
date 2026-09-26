// Known domains, mirrored from the link_rules_and_moderation migration
// (public.link_key / link_host / is_adult_link / is_link_in_bio) and from
// src/lib/profile.ts. Keep all three in step.

export function linkKey(url: string): string {
  return url.trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
}

export function linkHost(url: string): string {
  return linkKey(url).split('/')[0].split(':')[0].replace(/^.*@/, '')
}

const ADULT_HOST = new RegExp(
  '(^|\\.)(' +
  'onlyfans|fansly|justforfans|loyalfans|manyvids|fancentro|fanvue|fanhouse|admireme|unlockt|4myfans|' +
  'clips4sale|iwantclips|sextpanther|pornhub|xvideos|xhamster|redtube|youporn|brazzers|' +
  'chaturbate|myfreecams|stripchat|cam4|livejasmin|bongacams|adultfriendfinder|' +
  'sniffies|grindr|scruff|recon|feeld|rentmen|tryst' +
  ')\\.(com|net|co|xxx|tv|app|io|me|to|vip|fans|gg|club)$' +
  '|(^|\\.)justfor\\.fans$' +
  '|\\.(xxx|porn|adult|sex)$',
)

const BIO_HOST = new RegExp(
  '(^|\\.)(' +
  'linktr\\.ee|linktree\\.com|beacons\\.ai|beacons\\.page|bio\\.link|linkin\\.bio|lnk\\.bio|linkbio\\.co|' +
  'allmylinks\\.com|campsite\\.bio|solo\\.to|taplink\\.cc|taplink\\.at|tap\\.bio|bio\\.site|hoo\\.be|' +
  'milkshake\\.app|msha\\.ke|komi\\.io|snipfeed\\.co|linkpop\\.com|many\\.link|bento\\.me|linkr\\.bio|' +
  'hopp\\.bio|link\\.me|heylink\\.me|contactin\\.bio|direct\\.me|flow\\.page|linkfly\\.to|linkme\\.bio|' +
  'carrd\\.co|withkoji\\.com|koji\\.to|stan\\.store|linkbun\\.ch|biolinky\\.co|shor\\.by|' +
  'getallmylinks\\.com|linkinprofile\\.com|linkinbio\\.com|url\\.bio|joy\\.link' +
  ')$',
)

export const isAdultHost = (host: string) => ADULT_HOST.test(host)
export const isLinkInBioHost = (host: string) => BIO_HOST.test(host)

// Words in a host name that make it worth a closer look. A hint, never a
// verdict on its own: `fans` is also fansided.com (sports news) and `link`
// is also linkedin.com. Jev reads the page and decides.
export function hostHints(host: string): string[] {
  const hints: string[] = []
  if (/fans|jff|nsfw|porn|xxx|onlyf|spicy|lewd|\.fans$|\.vip$/.test(host)) hints.push('adult')
  if (/link|bio|beacons|\.bio$|\.ee$|\.page$/.test(host)) hints.push('link_in_bio')
  return hints
}

// Big general-purpose platforms: never adult-only, never a link-in-bio page,
// never worth a model call. (Adult creators exist on some of these; the
// platform itself is not an adult platform, which is what the rule is about.)
const ALLOWED = new RegExp(
  '(^|\\.)(' +
  'instagram\\.com|tiktok\\.com|twitter\\.com|x\\.com|bsky\\.app|threads\\.net|facebook\\.com|fb\\.com|' +
  'youtube\\.com|youtu\\.be|twitch\\.tv|discord\\.gg|discord\\.com|linkedin\\.com|lnkd\\.in|github\\.com|' +
  'etsy\\.com|spotify\\.com|bandcamp\\.com|soundcloud\\.com|venmo\\.com|cash\\.app|paypal\\.com|paypal\\.me|' +
  'ko-fi\\.com|patreon\\.com|reddit\\.com|tumblr\\.com|mastodon\\.social|substack\\.com|medium\\.com|' +
  'pinterest\\.com|snapchat\\.com|vimeo\\.com|apple\\.com|google\\.com|gofundme\\.com|eventbrite\\.com|' +
  'meetup\\.com|wikipedia\\.org|gmail\\.com|outlook\\.com|icloud\\.com|lgbtqut\\.app|' +
  'thetrevorproject\\.org|glaad\\.org|hrc\\.org|pflag\\.org|utahpride\\.org|equalityutah\\.org'  +
  ')$',
)

export const isAllowedHost = (host: string) => ALLOWED.test(host)

// Tokens in free text that look like links. Mirrors public.links_in_text.
const IN_TEXT = /((https?:\/\/)?([a-z0-9-]+\.)+(com|net|org|io|co|me|ee|bio|link|page|site|app|ai|fans|xxx|porn|to|cc|gg|vip|store|tv|at|ch|be|by|us|club|lgbt)(\/[^\s)>"']*[^\s)>"'.,!?;:])?)(?![a-z0-9-])/gi

export function linksInText(body: string): string[] {
  return [...(body ?? '').matchAll(IN_TEXT)].map((m) => m[1])
}
