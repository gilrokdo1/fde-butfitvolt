"""
멤버십 이상케이스 감지 job
- 케이스 A: 팀버핏 멤버십이 있는데 같은 기간 피트니스 멤버십이 없는 회원
- 케이스 B: 팀버핏 멤버십 2개 이상이 기간 중첩되는 회원
신규 케이스만 INSERT (기존 케이스는 anomaly_key UNIQUE로 중복 방지)
"""

from utils.db import safe_db


def detect():
    # ── 케이스 A: 팀버핏 있는데 피트니스 없음 (지점+회원 기준 1행) ────
    with safe_db("replica") as (_, cur):
        cur.execute("""
            SELECT DISTINCT ON (tf.user_id, tf.place)
                tf.mbs_id          AS teamfit_mbs_id,
                tf.user_id,
                tf.phone_number,
                tf.place,
                tf.begin_date      AS teamfit_begin,
                tf.end_date        AS teamfit_end,
                tf.product_name    AS teamfit_mbs_name,
                uu.name            AS user_name
            FROM raw_data_activeuser tf
            LEFT JOIN user_user uu ON uu.id = tf.user_id
            WHERE tf.category = '팀버핏'
              AND tf.end_date >= CURRENT_DATE
              AND NOT EXISTS (
                SELECT 1
                FROM raw_data_activeuser fit
                WHERE fit.user_id    = tf.user_id
                  AND fit.category   = '피트니스'
                  AND fit.begin_date <= tf.end_date
                  AND fit.end_date   >= tf.begin_date
              )
            ORDER BY tf.user_id, tf.place, tf.end_date DESC
        """)
        case_a = cur.fetchall()

    # ── 케이스 B: 팀버핏 기간 중첩 (지점+회원 기준 1행) ──────────────
    with safe_db("replica") as (_, cur):
        cur.execute("""
            SELECT DISTINCT ON (a.user_id, a.place)
                a.user_id,
                a.phone_number,
                a.place,
                a.mbs_id           AS teamfit_mbs_id,
                a.begin_date       AS teamfit_begin,
                a.end_date         AS teamfit_end,
                a.product_name     AS teamfit_mbs_name,
                b.mbs_id           AS overlap_mbs_id,
                b.begin_date       AS overlap_begin,
                b.end_date         AS overlap_end,
                uu.name            AS user_name
            FROM raw_data_activeuser a
            JOIN raw_data_activeuser b
              ON  a.user_id    = b.user_id
              AND a.place      = b.place
              AND a.category   = '팀버핏'
              AND b.category   = '팀버핏'
              AND a.mbs_id     < b.mbs_id
              AND a.begin_date <= b.end_date
              AND a.end_date   >= b.begin_date
            LEFT JOIN user_user uu ON uu.id = a.user_id
            WHERE a.end_date >= CURRENT_DATE
               OR b.end_date >= CURRENT_DATE
            ORDER BY a.user_id, a.place, a.mbs_id
        """)
        case_b = cur.fetchall()

    inserted = 0

    with safe_db("fde") as (_, cur):
        # replica DB 정상 확인 후 pending 행 먼저 초기화 → 이전 로직 잘못된 행 포함 제거
        # resolved(처리완료) 행은 status 조건으로 보존
        if case_b:
            cur.execute("""
                DELETE FROM soyeon_anomalies
                WHERE anomaly_type = 'teamfit_overlap'
                  AND status = 'pending'
            """)
        if case_a:
            cur.execute("""
                DELETE FROM soyeon_anomalies
                WHERE anomaly_type = 'no_fitness'
                  AND status = 'pending'
            """)

        for row in case_a:
            key = f"no_fitness:{row['user_id']}:{row['place']}"
            cur.execute("""
                INSERT INTO soyeon_anomalies
                    (anomaly_key, anomaly_type, user_id, phone_number, place,
                     user_name, teamfit_mbs_id, teamfit_mbs_name, teamfit_begin, teamfit_end)
                VALUES (%s, 'no_fitness', %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (anomaly_key) DO NOTHING
            """, (key, row["user_id"], row["phone_number"], row["place"],
                  row["user_name"], row["teamfit_mbs_id"], row["teamfit_mbs_name"],
                  row["teamfit_begin"], row["teamfit_end"]))
            inserted += cur.rowcount

        for row in case_b:
            key = f"overlap:{row['user_id']}:{row['place']}"
            cur.execute("""
                INSERT INTO soyeon_anomalies
                    (anomaly_key, anomaly_type, user_id, phone_number, place,
                     user_name, teamfit_mbs_id, teamfit_mbs_name, teamfit_begin, teamfit_end,
                     overlap_mbs_id, overlap_begin, overlap_end)
                VALUES (%s, 'teamfit_overlap', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (anomaly_key) DO NOTHING
            """, (key, row["user_id"], row["phone_number"], row["place"],
                  row["user_name"], row["teamfit_mbs_id"], row["teamfit_mbs_name"],
                  row["teamfit_begin"], row["teamfit_end"],
                  row["overlap_mbs_id"], row["overlap_begin"], row["overlap_end"]))
            inserted += cur.rowcount

    print(f"[감지 완료] 케이스A: {len(case_a)}건, 케이스B: {len(case_b)}건, 신규: {inserted}건")
    return {"case_a": len(case_a), "case_b": len(case_b), "inserted": inserted}
