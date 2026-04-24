"""
멤버십 이상케이스 감지 job
- 케이스 A: 팀버핏 종료일까지 커버하는 피트니스 멤버십이 없는 회원
  (피트니스가 없거나, 있더라도 팀버핏보다 먼저 끝나는 경우)
- 케이스 B: 같은 지점에서 팀버핏 멤버십 2개 이상이 기간 중첩되는 회원
"""

from utils.db import safe_db


def detect():
    # ── 케이스 A: 팀버핏 종료일까지 커버하는 피트니스가 없는 회원 ────────
    # 피트니스가 없거나, 있더라도 종료일이 팀버핏보다 앞인 경우 감지
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
                  AND fit.end_date   >= tf.end_date
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

    # 현재 이상 키 집합
    current_keys = (
        {f"no_fitness:{r['user_id']}:{r['place']}" for r in case_a}
        | {f"overlap:{r['user_id']}:{r['place']}" for r in case_b}
    )

    inserted = 0
    auto_resolved = 0

    with safe_db("fde") as (_, cur):
        # 기존 pending 키 조회
        cur.execute("SELECT anomaly_key FROM soyeon_anomalies WHERE status = 'pending'")
        existing_pending = {r["anomaly_key"] for r in cur.fetchall()}

        # 더 이상 이상이 없는 pending 행 → 자동 처리완료
        to_resolve = existing_pending - current_keys
        if to_resolve:
            cur.execute(
                """
                UPDATE soyeon_anomalies
                SET status = 'resolved', resolved_at = NOW(), resolved_by = '자동처리'
                WHERE status = 'pending'
                  AND anomaly_key = ANY(%s)
                """,
                (list(to_resolve),),
            )
            auto_resolved = cur.rowcount

        # 신규 이상 INSERT / 재발 시 pending으로 재오픈
        for row in case_a:
            key = f"no_fitness:{row['user_id']}:{row['place']}"
            cur.execute("""
                INSERT INTO soyeon_anomalies
                    (anomaly_key, anomaly_type, user_id, phone_number, place,
                     user_name, teamfit_mbs_id, teamfit_mbs_name, teamfit_begin, teamfit_end)
                VALUES (%s, 'no_fitness', %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (anomaly_key) DO UPDATE SET
                    status = 'pending', resolved_at = NULL, resolved_by = NULL,
                    phone_number = EXCLUDED.phone_number,
                    user_name = EXCLUDED.user_name,
                    teamfit_mbs_id = EXCLUDED.teamfit_mbs_id,
                    teamfit_mbs_name = EXCLUDED.teamfit_mbs_name,
                    teamfit_begin = EXCLUDED.teamfit_begin,
                    teamfit_end = EXCLUDED.teamfit_end
                WHERE soyeon_anomalies.status = 'resolved'
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
                ON CONFLICT (anomaly_key) DO UPDATE SET
                    status = 'pending', resolved_at = NULL, resolved_by = NULL,
                    phone_number = EXCLUDED.phone_number,
                    user_name = EXCLUDED.user_name,
                    teamfit_mbs_id = EXCLUDED.teamfit_mbs_id,
                    teamfit_mbs_name = EXCLUDED.teamfit_mbs_name,
                    teamfit_begin = EXCLUDED.teamfit_begin,
                    teamfit_end = EXCLUDED.teamfit_end,
                    overlap_mbs_id = EXCLUDED.overlap_mbs_id,
                    overlap_begin = EXCLUDED.overlap_begin,
                    overlap_end = EXCLUDED.overlap_end
                WHERE soyeon_anomalies.status = 'resolved'
            """, (key, row["user_id"], row["phone_number"], row["place"],
                  row["user_name"], row["teamfit_mbs_id"], row["teamfit_mbs_name"],
                  row["teamfit_begin"], row["teamfit_end"],
                  row["overlap_mbs_id"], row["overlap_begin"], row["overlap_end"]))
            inserted += cur.rowcount

    print(f"[감지 완료] 케이스A: {len(case_a)}건, 케이스B: {len(case_b)}건, 신규: {inserted}건, 자동처리: {auto_resolved}건")
    return {"case_a": len(case_a), "case_b": len(case_b), "inserted": inserted, "auto_resolved": auto_resolved}
