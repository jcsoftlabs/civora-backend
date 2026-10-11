// SOC-10 : premier compte propriétaire de la console (personne ne peut encore se connecter pour le créer).
// Usage : pnpm db:console-owner <email> "<Nom>"   (avec --env-file pour une autre base)
// Idempotent : un compte existant redevient propriétaire et actif ; sa double authentification est conservée.
import postgres from "postgres";

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length < 2) {
  console.error('Usage : pnpm db:console-owner <email> "<Nom>"');
  process.exit(1);
}
const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", {
  max: 1,
  ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
  onnotice: () => {},
});
await owner.begin(async (tx) => {
  await tx`select set_config('app.console', 'on', true)`;
  await tx`insert into platform_staff (email, name, role) values (${email.toLowerCase()}, ${name}, 'owner')
    on conflict (email) do update set role = 'owner', disabled_at = null, name = excluded.name, updated_at = now()`;
  await tx`insert into platform_audit_log (action, metadata) values ('staff.bootstrap', ${tx.json({ email: email.toLowerCase() })})`;
});
await owner.end();
console.log(`Compte propriétaire de la console prêt : ${email.toLowerCase()}.`);
