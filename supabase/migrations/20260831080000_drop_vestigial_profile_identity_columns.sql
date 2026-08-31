-- Sign-up could never succeed on a database built from these migrations.
--
-- 20260829220103 documents "Remove columns: email_hash, alias — no longer
-- needed" in its header, but issues no DROP. Both survived as NOT NULL with
-- no default, while the INSERT grant that migration rewrote covers only
-- (id, username, login_username, dob, hide_adult, pause_all, theme,
-- recovery_email). So the client was required to supply two columns it had
-- no privilege to write, and every profile insert after auth.signUp failed
-- with "Account created, but we could not save your profile."
--
-- They are genuinely dead: nothing in src/ or supabase/functions/ reads
-- either one. Supabase Auth owns identity now, and the alias/peppered-hash
-- scheme they belonged to was replaced by username/password sign-in.

alter table public.profiles drop column if exists email_hash;
alter table public.profiles drop column if exists alias;
