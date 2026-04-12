import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras


def _get_conn(db_type: str = "fde"):
    if db_type == "replica":
        return psycopg2.connect(
            host=os.getenv("REPLICA_DB_HOST"),
            port=int(os.getenv("REPLICA_DB_PORT", "5432")),
            dbname=os.getenv("REPLICA_DB_NAME"),
            user=os.getenv("REPLICA_DB_USER"),
            password=os.getenv("REPLICA_DB_PASSWORD"),
            connect_timeout=10,
            options="-c statement_timeout=30000",
        )
    return psycopg2.connect(
        host=os.getenv("FDE_DB_HOST", "localhost"),
        port=int(os.getenv("FDE_DB_PORT", "5432")),
        dbname=os.getenv("FDE_DB_NAME", "fde"),
        user=os.getenv("FDE_DB_USER", "fde"),
        password=os.getenv("FDE_DB_PASSWORD"),
        connect_timeout=10,
    )


@contextmanager
def safe_db(db_type: str = "fde"):
    conn = _get_conn(db_type)
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn, cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
