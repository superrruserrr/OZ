-- Retour arrière du lot 1.7ba : invitations de tuteur et rattachements en attente retirés. Aucune
-- fiche tuteur ni aucun rôle n'a été modifié par ce lot : rien d'autre à défaire.
DROP TRIGGER "users_release_guardian_invitations" ON "users";
DROP FUNCTION oz_guardian_invitations_release();
DROP FUNCTION oz_guardian_children();
DROP FUNCTION oz_guardian_invitation_accept(text);
DROP FUNCTION oz_guardian_invitation_read(text);
DROP FUNCTION oz_guardian_invitation_open(text);
DROP FUNCTION oz_guardian_invite(text, interval, text);
DROP TABLE "guardian_invitations";
