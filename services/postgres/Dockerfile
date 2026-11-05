# NOTE: match these two with the Postgres image (major version & Debian version)
# and Harbor infra.
FROM ghcr.io/cloudnative-pg/pgvector:0.8.7-18-trixie AS pg_vector
FROM paradedb/paradedb-extension:0.26.4-18-trixie@sha256:ed7fc01654c309433238e4db15fbc7613b349c12663b03bc2d70e1b97bf0ef6b AS pg_search

# Official Postgres image.
FROM postgres:18-trixie@sha256:3a4264520e121176619f54ff867d12774bc81e95e7b84db58d63bccdb6144b81 as pg

# Copy pg_vector extension.
COPY --from=pg_vector /lib/* /usr/lib/postgresql/18/lib/
COPY --from=pg_vector /share/extension/* /usr/share/postgresql/18/extension/
COPY --from=pg_vector /licenses* /usr/share/postgresql/18/

# Copy pg_search extension.
COPY --from=pg_search /lib/* /usr/lib/postgresql/18/lib/
COPY --from=pg_search /share/extension/* /usr/share/postgresql/18/extension/
COPY --from=pg_search /licenses* /usr/share/postgresql/18/

# Add scripts that install the extensions.
RUN echo "echo \"shared_preload_libraries = 'pg_search'\" >> \"${PGDATA}/postgresql.conf\"" >> "/docker-entrypoint-initdb.d/00_pg_search_config.sh"
RUN echo 'CREATE EXTENSION pg_search CASCADE;' >> "/docker-entrypoint-initdb.d/01_create_pg_search_extension.sql"

# Copied from the Postgres image:
ENTRYPOINT ["docker-entrypoint.sh"]
STOPSIGNAL SIGINT
EXPOSE 5432/tcp
CMD ["postgres"]
