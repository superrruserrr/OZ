-- Lot 1.7ba (EX-108 n° 1, 6, 7) : invitation du tuteur légal par le joueur mineur, puis acceptation
-- par le compte du tuteur. L'acceptation n'est qu'un rattachement EN ATTENTE, gardé ici : la fiche
-- tuteur déclarée à l'inscription (lot 1.7a) reste sans compte (`guardians.user_id` nul) et le rôle
-- tuteur n'est pas accordé. Les droits du tuteur (lots 1.4, 1.13, 1.16 : lecture, suppression,
-- export…) reposent sur `guardians.user_id` : ils ne s'ouvrent qu'à la vérification du lien (lots
-- 1.7bb et 1.10), qui posera le compte sur la fiche. Rien de l'existant ne s'ouvre donc à un compte
-- non vérifié.

-- Invitation : seule l'empreinte du jeton est gardée (le lien part par email ou est remis au joueur).
-- Une seule invitation vivante (en cours ou acceptée) par joueur : la suivante annule la précédente.
CREATE TABLE "guardian_invitations" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "guardian_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "accepted_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_by" UUID,

    CONSTRAINT "guardian_invitations_pkey" PRIMARY KEY ("id"),
    -- Acceptée par un compte, ou pas encore : jamais l'un sans l'autre.
    CONSTRAINT "guardian_invitations_accept_check" CHECK (("consumed_at" IS NULL) = ("accepted_by" IS NULL))
);
CREATE UNIQUE INDEX "guardian_invitations_token_hash_key" ON "guardian_invitations"("token_hash");
CREATE INDEX "guardian_invitations_player_id_idx" ON "guardian_invitations"("player_id");
CREATE INDEX "guardian_invitations_guardian_id_idx" ON "guardian_invitations"("guardian_id");
CREATE INDEX "guardian_invitations_accepted_by_idx" ON "guardian_invitations"("accepted_by");
ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guardian_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_invitations" FORCE ROW LEVEL SECURITY;

-- Aucune lecture ni écriture directe : les fonctions ci-dessous seulement.
CREATE POLICY "guardian_invitations_privileged" ON "guardian_invitations" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- ---------------------------------------------------------------------------------------------
-- Émission : l'appelant est le joueur mineur titulaire, sa fiche tuteur déclarée n'a pas de compte.
-- Annule l'invitation vivante précédente, acceptée ou non (mauvais destinataire : le joueur
-- réinvite), en crée une, et rend l'email du tuteur déchiffré s'il en a donné un (l'API envoie alors
-- le lien ; sinon le joueur le transmet lui-même, D1). Rend {outcome: created, email,
-- childFirstName}, ou no_player, adult, no_guardian, linked, refused.
-- Verrous dans le même ordre que l'acceptation : joueur, fiche tuteur, puis invitations.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_invite(p_token_hash text, p_ttl interval, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_player_signup_account();
  child players;
  tutor guardians;
  address text;
  created uuid;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  PERFORM oz_auth_check_ttl(p_ttl);
  IF me IS NULL THEN RETURN jsonb_build_object('outcome', 'refused'); END IF;
  SELECT * INTO child FROM players p WHERE p.user_id = me AND p.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'no_player'); END IF;
  IF NOT oz_is_minor(child.birth_date) THEN RETURN jsonb_build_object('outcome', 'adult'); END IF;
  IF child.guardian_id IS NULL THEN RETURN jsonb_build_object('outcome', 'no_guardian'); END IF;
  SELECT * INTO tutor FROM guardians g WHERE g.id = child.guardian_id AND g.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'no_guardian'); END IF;
  IF tutor.user_id IS NOT NULL THEN RETURN jsonb_build_object('outcome', 'linked'); END IF;

  -- Email illisible (clé changée) : l'erreur remonte ; aucun lien n'est remis au joueur à la place.
  address := oz_decrypt(tutor.email_encrypted, p_key);

  UPDATE guardian_invitations SET cancelled_at = now()
  WHERE player_id = child.id AND cancelled_at IS NULL;
  INSERT INTO guardian_invitations (guardian_id, player_id, token_hash, expires_at, created_by)
  VALUES (tutor.id, child.id, p_token_hash, now() + p_ttl, me)
  RETURNING id INTO created;

  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'guardian.invitation.created', 'guardian', tutor.id, 'Invitation du tuteur légal',
    jsonb_build_object('invitation_id', created, 'channel', CASE WHEN address IS NULL THEN 'link' ELSE 'email' END));
  RETURN jsonb_build_object('outcome', 'created', 'email', address, 'childFirstName', child.first_name);
END $$;

-- Invitation utilisable : ni acceptée, ni annulée, ni expirée ; fiche tuteur sans compte ; joueur
-- encore mineur et toujours rattaché à cette fiche. Interne.
CREATE FUNCTION oz_guardian_invitation_open(p_token_hash text) RETURNS guardian_invitations
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT i.* FROM guardian_invitations i
  JOIN players p ON p.id = i.player_id AND p.deleted_at IS NULL AND oz_is_minor(p.birth_date)
    AND p.guardian_id = i.guardian_id
  JOIN guardians g ON g.id = i.guardian_id AND g.deleted_at IS NULL AND g.user_id IS NULL
  WHERE i.token_hash = p_token_hash AND i.consumed_at IS NULL AND i.cancelled_at IS NULL
    AND i.expires_at > now()
$$;

-- Aperçu avant connexion : le prénom de l'enfant et le lien déclaré seulement (ni nom, ni date de
-- naissance, ni OZ ID). NULL si l'invitation n'est pas utilisable, sans motif.
CREATE FUNCTION oz_guardian_invitation_read(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  invitation guardian_invitations;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  invitation := oz_guardian_invitation_open(p_token_hash);
  IF invitation.id IS NULL THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object('childFirstName', p.first_name, 'relationship', g.relationship)
    FROM players p JOIN guardians g ON g.id = invitation.guardian_id
    WHERE p.id = invitation.player_id);
END $$;

-- ---------------------------------------------------------------------------------------------
-- Acceptation : le compte connecté (email vérifié, et qui n'est pas lui-même un joueur mineur)
-- devient le tuteur EN ATTENTE de l'enfant. Ni `guardians.user_id`, ni le rôle tuteur ne sont
-- posés : aucun droit sur la fiche avant la vérification du lien. Rend {outcome: accepted,
-- playerId}, ou invalid (inconnue, expirée, déjà acceptée, annulée, joueur majeur, fiche déjà liée),
-- self (l'enfant lui-même), refused (compte non vérifié ou suspendu, ou compte d'un joueur mineur).
-- Verrous dans le même ordre que l'émission : joueur, fiche tuteur, puis invitation.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_invitation_accept(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_player_signup_account();
  invitation guardian_invitations;
  child players;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  IF me IS NULL THEN RETURN jsonb_build_object('outcome', 'refused'); END IF;
  -- Lecture sans verrou pour connaître le joueur, puis verrous dans l'ordre, puis relecture.
  invitation := oz_guardian_invitation_open(p_token_hash);
  IF invitation.id IS NULL THEN RETURN jsonb_build_object('outcome', 'invalid'); END IF;
  SELECT * INTO child FROM players p WHERE p.id = invitation.player_id FOR UPDATE;
  PERFORM 1 FROM guardians g WHERE g.id = invitation.guardian_id FOR UPDATE;
  PERFORM 1 FROM guardian_invitations i WHERE i.id = invitation.id FOR UPDATE;
  -- Deux acceptations concurrentes : la seconde relit l'invitation déjà acceptée.
  invitation := oz_guardian_invitation_open(p_token_hash);
  IF invitation.id IS NULL OR child.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;
  IF child.user_id = me THEN RETURN jsonb_build_object('outcome', 'self'); END IF;
  -- Un mineur n'est le tuteur de personne.
  IF EXISTS (SELECT 1 FROM players p WHERE p.user_id = me AND p.deleted_at IS NULL
               AND oz_is_minor(p.birth_date)) THEN
    RETURN jsonb_build_object('outcome', 'refused');
  END IF;

  UPDATE guardian_invitations SET consumed_at = now(), accepted_by = me WHERE id = invitation.id;

  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'guardian.invitation.accepted', 'guardian', invitation.guardian_id,
    'Invitation du tuteur légal acceptée', jsonb_build_object('invitation_id', invitation.id));
  RETURN jsonb_build_object('outcome', 'accepted', 'playerId', child.id);
END $$;

-- ---------------------------------------------------------------------------------------------
-- Enfants mineurs du compte du contexte (EX-108 n° 6) : rattachements en attente (invitation
-- acceptée, non annulée) et fiches tuteur déjà liées au compte. Le nom et l'OZ ID ne sortent que
-- pour un tuteur vérifié ; sinon le prénom et le statut seulement.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_children()
RETURNS TABLE (guardian_verified boolean, oz_id text, first_name text, last_name text,
  verification_status text, published boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH ctx AS (SELECT oz_player_signup_account() AS me)
  SELECT v.verified,
    CASE WHEN v.verified THEN p.oz_id END,
    p.first_name,
    CASE WHEN v.verified THEN p.last_name END,
    p.verification_status::text,
    oz_player_published(p.id, p.guardian_id, p.verification_status)
  FROM ctx
  JOIN players p ON p.deleted_at IS NULL AND oz_is_minor(p.birth_date)
  JOIN guardians g ON g.id = p.guardian_id AND g.deleted_at IS NULL
  CROSS JOIN LATERAL (
    SELECT coalesce(g.user_id = ctx.me AND g.verification_status = 'verified', false) AS verified) v
  WHERE ctx.me IS NOT NULL
    AND (g.user_id = ctx.me
      OR (g.user_id IS NULL AND EXISTS (
            SELECT 1 FROM guardian_invitations i
            WHERE i.player_id = p.id AND i.guardian_id = g.id AND i.accepted_by = ctx.me
              AND i.cancelled_at IS NULL)))
  ORDER BY p.created_at, p.id
$$;

-- Compte clos : ses rattachements en attente tombent (le joueur pourra réinviter).
CREATE FUNCTION oz_guardian_invitations_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE guardian_invitations SET cancelled_at = now()
  WHERE accepted_by = NEW.id AND cancelled_at IS NULL;
  RETURN NULL;
END $$;
CREATE TRIGGER "users_release_guardian_invitations" AFTER UPDATE OF "deleted_at" ON "users"
  FOR EACH ROW WHEN (OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL)
  EXECUTE FUNCTION oz_guardian_invitations_release();

REVOKE EXECUTE ON FUNCTION oz_guardian_invite(text, interval, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_invitation_open(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_invitation_read(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_invitation_accept(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_children() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_invitations_release() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_guardian_invite(text, interval, text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_invitation_read(text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_invitation_accept(text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_children() TO oz_app;
  END IF;
END $$;
