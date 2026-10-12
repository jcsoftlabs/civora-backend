ALTER TABLE "publications" ADD COLUMN "author_member_id" uuid;--> statement-breakpoint
-- Publications déjà en ligne : l'auteur est la personne qui les a publiées (journal d'audit).
UPDATE "publications" p SET "author_member_id" = m."id"
FROM "audit_log" a JOIN "members" m ON m."user_id" = a."actor_user_id" AND m."party_id" = a."party_id"
WHERE a."action" = 'publication.publish' AND a."target_id" = p."id" AND a."party_id" = p."party_id"
  AND p."author_member_id" IS NULL;
