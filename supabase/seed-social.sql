-- A small demo community for the Feed and personal profiles.
--
-- Run it by hand in the SQL editor (or with psql as the postgres role), after
-- the migrations. It is not a migration: demo people do not belong in a
-- production schema's history, and removing them is one statement (below).
--
-- Idempotent. Every row has a fixed id, so running it twice changes nothing,
-- and running it after a demo row was deleted puts that row back.
--
-- The people are placeholders with no way to sign in: their auth.users rows
-- carry no password and an address on the reserved `.invalid` TLD. Profiles
-- are `discoverable` + `recommendable`, so they appear under Feed → Discover
-- and in "People to follow". Avatars are left empty (initials in a stable
-- colour) because the rate_social_profile trigger only accepts pictures
-- uploaded to the person's own storage folder; headers use built-in presets.
--
-- To remove every demo row (cascades to profiles, posts, likes, follows):
--   delete from auth.users where id::text like '5eed0000-%';

begin;

-- ----------------------------------------------------------------- people

create temp table demo_people on commit drop as
select * from (values
  (1, 'sagebrushsam', 'Sam Okafor', 'they/them', 'Salt Lake County', 'preset:wasatch',
      'Trail runner, bad at karaoke, great at snacks. Organizing a queer hiking crew for the Wasatch this fall.',
      array['Nonbinary', 'Queer'], array['Hiking', 'Karaoke', 'Coffee'], array['instagram.com/sagebrushsam']),
  (2, 'mariposa.lu', 'Lucía Marín', 'she/her', 'Utah County', 'preset:sunset',
      'Librarian by day, zine maker by night. Ask me about the Provo queer book swap.',
      array['Lesbian'], array['Book club', 'Zines', 'Crafts'], array['bsky.app/profile/mariposa.lu']),
  (3, 'redrockronan', 'Ronan Tso', 'he/him', 'Washington County', 'preset:redrock',
      'Diné, gay, and permanently sunburnt. Climbing, photography and very strong opinions about fry sauce.',
      array['Gay', 'Two-Spirit'], array['Climbing', 'Photography'], array[]::text[]),
  (4, 'jules.makes', 'Jules Hart', 'she/they', 'Weber County', 'preset:trans',
      'Trans woman, maker, cat parent. Running a monthly craft night at the Ogden library.',
      array['Trans', 'Bi'], array['Crafts', 'Pets', 'Gaming'], array['etsy.com/shop/julesmakes']),
  (5, 'dadof2ut', 'Marcus Bell', 'he/him', 'Davis County', 'preset:meadow',
      'Proud dad of a trans teen. Here to learn, listen, and show up. Parent support group Thursdays.',
      array['Ally', 'Parent'], array['Parent support', 'Cooking'], array[]::text[]),
  (6, 'ace.of.cache', 'Priya Raman', 'any pronouns', 'Cache County', 'preset:ace',
      'USU grad student. Ace, aro-ish, extremely into board games and mutual aid.',
      array['Ace', 'Aro'], array['Board games', 'Mutual aid', 'Study groups'], array[]::text[]),
  (7, 'parkcitypat', 'Pat Delgado', 'he/they', 'Summit County', 'preset:night',
      'Ski instructor. Sober and loving it. Coffee after the lifts close, anyone?',
      array['Queer', 'Pan'], array['Skiing', 'Sober', 'Coffee'], array[]::text[]),
  (8, 'drag.of.the.desert', 'Vera Villanelle', 'she/her', 'Salt Lake County', 'preset:pride',
      'Drag performer and full-time sequin enthusiast. Hosting brunch shows around SLC.',
      array['Gay', 'Queer'], array['Drag', 'Live music'], array['instagram.com/veravillanelle', 'tiktok.com/@veravillanelle'])
) as t(n, handle, name, pronouns, county, header, bio, ids, interests, links);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000',
         ('5eed0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
         'authenticated', 'authenticated',
         'demo-' || n || '@seed.lgbtq-ut.invalid', '',
         now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"demo":true}'::jsonb,
         now() - (n || ' days')::interval, now()
  from demo_people
on conflict (id) do nothing;

insert into public.profiles (id, username, login_username, dob)
  select ('5eed0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
         handle, 'demo-' || n, date '1990-01-01' + (n * 400)
  from demo_people
on conflict (id) do nothing;

insert into public.social_profiles (id, display_name, public_handle, header_url, bio, pronouns,
                                    identity_labels, interests, social_links, county,
                                    visibility, search_visible, recommendable, indexable)
select ('5eed0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       name, handle, header, bio, pronouns, ids, interests, links, county,
       'discoverable', true, true, false
  from demo_people
on conflict (id) do nothing;

-- ------------------------------------------------------------------ posts
-- Post ids are claimed from the top of the bigint range so they can never
-- collide with the sequence the app's own posts draw from.

insert into public.posts (id, author_id, body, created_at)
select 9000000000000000000 + n,
       ('5eed0000-0000-4000-8000-' || lpad(author::text, 12, '0'))::uuid,
       body, now() - (mins || ' minutes')::interval
  from (values
    (1, 1, 'Queer hiking crew, first outing Saturday: Donut Falls, easy pace, dogs welcome. Meet at the Mill D lot at 9. Reply if you want the carpool thread.', 38),
    (2, 8, 'Brunch show this Sunday. Bring singles, bring your mom, bring your mom''s singles.', 95),
    (3, 5, 'My kid asked me to stop saying "phase". Fair. Thank you to everyone at Thursday group who has been so patient with a dad still learning.', 170),
    (4, 2, 'The Provo book swap is back: second Saturday, 2pm, the usual coffee shop. This month''s theme is "books that saved you".', 260),
    (5, 6, 'Board game night at the Logan library had 14 people. FOURTEEN. Cache Valley, I love you.', 410),
    (6, 4, 'Craft night recap: 9 people, 3 cats (virtual), 1 very ambitious pride quilt. Next one is the 18th.', 620),
    (7, 3, 'Golden hour at Snow Canyon tonight. Some days this state makes it easy to stay.', 900),
    (8, 7, 'Two years sober today. Celebrated with an obscene amount of hot chocolate at the base lodge.', 1300),
    (9, 1, 'Carpool thread for Saturday is up. We have room for four more.', 1500),
    (10, 6, 'Mutual aid fridge on 4th North needs shelf-stable stuff. Rice, beans, peanut butter, pads.', 2100),
    (11, 2, 'Just finished a zine about growing up queer in Happy Valley. Printing 50 copies, free at the book swap.', 2900),
    (12, 8, 'Reminder that drag is art, joy, and a tradition older than everyone yelling about it.', 4300)
  ) as t(n, author, body, mins)
on conflict (id) do nothing;

-- -------------------------------------------------------- follows & likes

insert into public.follows (follower_id, followee_id)
select ('5eed0000-0000-4000-8000-' || lpad(a::text, 12, '0'))::uuid,
       ('5eed0000-0000-4000-8000-' || lpad(b::text, 12, '0'))::uuid
  from (values (1,2),(1,3),(1,8),(2,1),(2,4),(3,1),(3,7),(4,2),(4,6),(4,8),(5,1),(5,4),
               (6,2),(6,4),(7,3),(7,8),(8,1),(8,4),(8,5),(8,7)) as f(a, b)
on conflict do nothing;

insert into public.post_likes (post_id, profile_id)
select 9000000000000000000 + p,
       ('5eed0000-0000-4000-8000-' || lpad(who::text, 12, '0'))::uuid
  from (values (1,2),(1,3),(1,5),(1,8),(2,1),(2,4),(2,7),(3,1),(3,2),(3,4),(3,6),(3,8),
               (4,4),(4,6),(5,2),(5,4),(6,2),(6,8),(7,1),(7,7),(8,1),(8,3),(8,5),(8,8),
               (10,2),(10,4),(11,6),(12,1),(12,4),(12,7)) as l(p, who)
on conflict do nothing;

insert into public.comments (id, post_id, author_id, body, created_at)
select 9000000000000000000 + n, 9000000000000000000 + p,
       ('5eed0000-0000-4000-8000-' || lpad(who::text, 12, '0'))::uuid,
       body, now() - (mins || ' minutes')::interval
  from (values
    (1, 1, 3, 'In. Bringing the good trail mix.', 30),
    (2, 1, 2, 'Is it okay for someone who has never hiked? Asking for me.', 25),
    (3, 1, 1, 'Absolutely. We go at the pace of the slowest person, always.', 20),
    (4, 3, 4, 'This made me tear up a little. Your kid is lucky.', 150),
    (5, 8, 1, 'Two years!! So proud of you.', 1200)
  ) as c(n, p, who, body, mins)
on conflict (id) do nothing;

commit;
