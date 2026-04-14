"""
멤버십 이상케이스 감지 job
- 케이스 A: 팀버핏 멤버십이 있는데 같은 기간 피트니스 멤버십이 없는 회원
- 케이스 B: 팀버핏 멤버십 2개 이상이 기간 중첩되는 회원
신규 케이스만 INSERT (기존 케이스는 anomaly_key UNIQUE로 중복 방지)
"""

from utils.db import safe_db


def detect():
    # ── 케이스 A: 팀버핏 있는데 피트니스 없음 ──────────────────────────
    with safe_db("replica") as (_, cur):
        cur.execute("""
            SELECT
                tf.mbs_id        AS teamfit_mbs_id,
                tf.user_id,
                tf.phone_number,
                tf.place,
                tf.begin_date    AS teamfit_begin,
                tf.end_date      AS teamfit_end
            FROM raw_data_activeuser tf
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
        """)
        case_a = cur.fetchall()

    # ── 케이스 B: 팀버핏 멤버십 기간 중첩 ────────────────────────────────
    with safe_db("replica") as (_, cur):
        cur.execute("""
            SELECT
                a.user_id,
                a.phone_number,
                a.place,
                a.mbs_id       AS teamfit_mbs_id,
                a.begin_date   AS teamfit_begin,
                a.end_date     AS teamfit_end,
                b.mbs_id       AS overlap_mbs_id,
                b.begin_date   AS overlap_begin,
                b.end_date     AS overlap_end
            FROM raw_data_activeuser a
            JOIN raw_data_activeuser b
              ON  a.user_id    = b.user_id
              AND a.category   = '팀버핏'
              AND b.category   = '팀버핏'
              AND a.mbs_id     < b.mbs_id
              AND a.begin_date <= b.end_date
              AND a.end_date   >= b.begin_date
            WHERE a.end_date >= CURRENT_DATE
               OR b.end_date >= CURRENT_DATE
        """)
        case_b = cur.fetchall()

    inserted = 0

    with safe_db("fde") as (_, cur):
        for row in case_a:
            key = f"no_fitness:{row['teamfit_mbs_id']}"
            cur.execute("""
                INSERT INTO soyeon_anomalies
                    (anomaly_key, anomaly_type, user_id, phone_number, place,
                     teamfit_mbs_id, teamfit_begin, teamfit_end)
                VALUES (%s, 'no_fitness', %s, %s, %s, %s, %s, %s)
                ON CONFLICT (anomaly_key) DO NOTHING
            """, (key, row["user_id"], row["phone_number"], row["place"],
                  row["teamfit_mbs_id"], row["teamfit_begin"], row["teamfit_end"]))
            inserted += cur.rowcount

        for row in case_b:
            key = f"overlap:{row['teamfit_mbs_id']}:{row['overlap_mbs_id']}"
            cur.execute("""
                INSERT INTO soyeon_anomalies
                    (anomaly_key, anomaly_type, user_id, phone_number, place,
                     teamfit_mbs_id, teamfit_begin, teamfit_end,
                     overlap_mbs_id, overlap_begin, overlap_end)
                VALUES (%s, 'teamfit_overlap', %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (anomaly_key) DO NOTHING
            """, (key, row["user_id"], row["phone_number"], row["place"],
                  row["teamfit_mbs_id"], row["teamfit_begin"], row["teamfit_end"],
                  row["overlap_mbs_id"], row["overlap_begin"], row["overlap_end"]))
            inserted += cur.rowcount

    print(f"[감지 완료] 케이스A: {len(case_a)}건, 케이스B: {len(case_b)}건, 신규: {inserted}건")
    return {"case_a": len(case_a), "case_b": len(case_b), "inserted": inserted}
