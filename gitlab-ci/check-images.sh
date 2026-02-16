#!/bin/bash
set -euo pipefail

if grep -q "$POSTGRES_IMAGE" docker-compose.development.yml
then 
    echo "Postgres version matches in docker-compose.development.yml"
else 
    echo "Postgres version mismatch in docker-compose.development.yml!"
    exit 1
fi

if grep -q "$POSTGRES_IMAGE" docker-compose.production.yml
then 
    echo "Postgres version matches in docker-compose.production.yml"
else 
    echo "Postgres version mismatch in docker-compose.production.yml!"
    exit 1
fi

if grep -q "$SEARCH_IMAGE" docker-compose.development.yml
then 
    echo "Search version matches in docker-compose.development.yml"
else 
    echo "Search version mismatch in docker-compose.development.yml!"
    exit 1
fi

if grep -q "$SEARCH_IMAGE" docker-compose.production.yml
then 
    echo "Search version matches in docker-compose.production.yml"
else 
    echo "Search version mismatch in docker-compose.production.yml!"
    exit 1
fi

