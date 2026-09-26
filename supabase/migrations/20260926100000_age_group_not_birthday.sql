-- Keep the age group, not the birthday.
--
-- The 18+ and 21+ gates only ever need to know which side of a line someone
-- is on. A full date of birth, tied to an account in a queer directory, is a
-- far more identifying thing to hold than that. So auth-signup reads the date
-- once, and stores:
--
--   age_group       'under_18' | '18_20' | '21_plus'
--   next_group_on   when the group next changes, always the 1st of the month
--                   after the birthday that changes it: the 18th birthday for
--                   under_18, the 21st for 18_20. Null for 21_plus, which
--                   never changes — so for most adults nothing about their
--                   birthday is kept at all.
--
-- Rounding to the following 1st means a gate opens up to a month late,
-- never early, and what remains is at most a birth month and year, held only
-- for people under 21.
--
-- Groups advance on read (age_floor below); nothing has to rewrite rows.
-- Under-13s are refused before anything is sent (auth-signup and the
-- client), so no row here is ever a child's.

alter table public.profiles
  add column if not exists age_group     text check (age_group in ('under_18', '18_20', '21_plus')),
  add column if not exists next_group_on date;

-- 1st of the month after a date.
create or replace function public.first_of_next_month(d date)
returns date language sql immutable
as $$ select (date_trunc('month', d) + interval '1 month')::date $$;

-- Existing accounts: work the group out from the stored date, then drop it.
update public.profiles set
  age_group = case
    when dob <= current_date - interval '21 years' then '21_plus'
    when dob <= current_date - interval '18 years' then '18_20'
    else 'under_18' end,
  next_group_on = case
    when dob <= current_date - interval '21 years' then null
    when dob <= current_date - interval '18 years' then public.first_of_next_month((dob + interval '21 years')::date)
    else public.first_of_next_month((dob + interval '18 years')::date) end
where dob is not null and age_group is null;

-- The lowest age the group guarantees today: 0, 18 or 21. The 21st-birthday
-- month is the 18th-birthday month three years on, so one stored date
-- carries an under-18 all the way through.
create or replace function public.age_floor(age_group text, next_group_on date)
returns integer language sql stable
as $$
  select case
    when age_group = '21_plus' then 21
    when age_group = '18_20' then case when next_group_on <= current_date then 21 else 18 end
    when age_group = 'under_18' then case
      when next_group_on + interval '3 years' <= current_date then 21
      when next_group_on <= current_date then 18
      else 0 end
    else 0 end
$$;

-- Same contract as before; it just reads the group instead of a birthday.
create or replace function public.viewer_is_adult()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and public.age_floor(p.age_group, p.next_group_on) >= 18
  );
$$;

alter table public.profiles drop column if exists dob;

grant select (age_group, next_group_on) on public.profiles to authenticated;
