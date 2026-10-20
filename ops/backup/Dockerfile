# Sauvegardes de la base (NFR-06). Même version de Postgres que la production : pg_dump et pg_restore 18, et un
# serveur pour le test de restauration, lancé dans le conteneur.
FROM postgres:18-alpine
RUN apk add --no-cache curl openssl
COPY ops/backup/*.sh /opt/backup/
# Tout tourne sous le compte postgres : initdb refuse root, et l'hébergeur peut interdire de changer de compte.
USER postgres
WORKDIR /tmp
# L'image Postgres démarre un serveur par défaut : ici, on lance seulement le script.
ENTRYPOINT []
CMD ["sh", "/opt/backup/run.sh"]
