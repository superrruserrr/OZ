-- Retire le renvoi de l'email de confirmation (lot 1.7cc).

DROP FUNCTION oz_auth_resend_verification(text, text, interval);
