-- Connexion depuis l'application mobile sans choisir son organisation : l'adresse e-mail ou le téléphone du
-- membre désigne une seule organisation (users.email et users.phone_e164 uniques, un compte par fiche de membre).
-- Rejoué après chaque migration par src/migrate.ts (idempotent).
--
-- Seules lectures transversales autorisées pour la connexion : l'identifiant (slug) d'une organisation active,
-- rien d'autre. L'API ne le révèle jamais à la personne avant qu'elle ait saisi le bon code.

CREATE OR REPLACE FUNCTION login_party_slug(p_email text, p_phone text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.slug
  FROM users u
  JOIN members m ON m.user_id = u.id AND m.deleted_at IS NULL
  JOIN parties p ON p.id = m.party_id AND p.status = 'active'
  WHERE (p_email IS NOT NULL AND u.email = p_email) OR (p_phone IS NOT NULL AND u.phone_e164 = p_phone)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION login_party_slug(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_party_slug(text, text) TO civora_app;

-- Organisation d'un code encore valable (le numéro du code n'est connu que de l'appareil qui l'a demandé).
CREATE OR REPLACE FUNCTION login_challenge_party_slug(p_challenge uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.slug
  FROM otp_challenges c
  JOIN parties p ON p.id = c.party_id AND p.status = 'active'
  WHERE c.id = p_challenge AND c.consumed_at IS NULL AND c.expires_at > now()
$$;
REVOKE ALL ON FUNCTION login_challenge_party_slug(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_challenge_party_slug(uuid) TO civora_app;
