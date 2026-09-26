// A birthday goes in; only an age group comes out. The date itself is never
// stored (see migration age_group_not_birthday). Mirrors public.age_floor.

export type AgeGroup = 'under_18' | '18_20' | '21_plus'

/** The youngest anyone may be to hold an account. Younger visitors browse as guests. */
export const MIN_ACCOUNT_AGE = 13

/** Parses `YYYY-MM-DD` as a UTC calendar date, or null when it is not a real past date. */
export function parseBirthday(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null // 2001-02-30
  if (d.getTime() > Date.now() || +m[1] < 1900) return null
  return d
}

export function ageOn(birthday: Date, today = new Date()): number {
  let age = today.getUTCFullYear() - birthday.getUTCFullYear()
  const m = today.getUTCMonth() - birthday.getUTCMonth()
  if (m < 0 || (m === 0 && today.getUTCDate() < birthday.getUTCDate())) age--
  return age
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** The 1st of the month after the birthday on which someone turns `years`. */
function monthAfterTurning(birthday: Date, years: number): string {
  return iso(new Date(Date.UTC(birthday.getUTCFullYear() + years, birthday.getUTCMonth() + 1, 1)))
}

/** What gets stored instead of the birthday. */
export function ageGroup(birthday: Date, today = new Date()): { age_group: AgeGroup; next_group_on: string | null } {
  const age = ageOn(birthday, today)
  if (age >= 21) return { age_group: '21_plus', next_group_on: null }
  if (age >= 18) return { age_group: '18_20', next_group_on: monthAfterTurning(birthday, 21) }
  return { age_group: 'under_18', next_group_on: monthAfterTurning(birthday, 18) }
}
