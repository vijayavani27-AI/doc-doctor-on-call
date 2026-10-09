"""Database: SQLite locally, Supabase Postgres (+ pgvector) in production. Same models for both."""
import logging

from sqlalchemy import JSON, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.types import TypeDecorator

from . import config
from .config import DATABASE_URL

log = logging.getLogger("doc.db")

if config.IS_POSTGRES:
    # Supabase pooler: no server-side prepared statements, small pool for the 512 MB free plan.
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=3, max_overflow=2, pool_recycle=300,
                           connect_args={"prepare_threshold": None, "connect_timeout": 10})
else:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Embedding(TypeDecorator):
    """vector(1024) on Postgres (pgvector), a JSON list everywhere else."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector

            return dialect.type_descriptor(Vector(config.EMBED_DIM))
        return dialect.type_descriptor(JSON())

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return [float(x) for x in value]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_missing_columns():
    """Tiny forward-only migration: add new nullable columns to tables created by older versions."""
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have:
                    continue
                ddl = col.type.compile(dialect=engine.dialect)
                default = ""
                if col.default is not None and col.default.is_scalar:
                    v = col.default.arg
                    default = f" DEFAULT {('TRUE' if v else 'FALSE') if isinstance(v, bool) else repr(v) if isinstance(v, (int, float)) else repr(str(v))}"
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ddl}{default}'))
                log.info("migrated: added %s.%s", table.name, col.name)


MATCH_CHUNKS_SQL = """
create or replace function match_chunks(query_embedding vector(1024), p_profile_id integer, match_count integer default 6)
returns table (id integer, source_type varchar, source_id varchar, text text, similarity double precision)
language sql stable as $$
  select c.id, c.source_type, c.source_id, c.text, 1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.profile_id = p_profile_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
"""


def init_db():
    from . import models  # noqa: F401  (register tables)

    if config.IS_POSTGRES:
        with engine.begin() as conn:
            conn.execute(text("create extension if not exists vector"))
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()
    if config.IS_POSTGRES:
        with engine.begin() as conn:
            conn.execute(text(MATCH_CHUNKS_SQL))
            # Row-level security ON with no policies = deny-all for Supabase's anon/authenticated roles.
            # Only this API (table owner / service role) can read or write; authorization is enforced in code.
            for table in Base.metadata.sorted_tables:
                conn.execute(text(f'alter table "{table.name}" enable row level security'))
            conn.execute(text("create index if not exists chunks_embedding_hnsw on chunks using hnsw (embedding vector_cosine_ops)"))
