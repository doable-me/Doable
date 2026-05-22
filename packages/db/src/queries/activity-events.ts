import type postgres from "postgres";

export interface ActivityEventRow {
  id: string;
  project_id: string;
  user_id: string;
  display_name: string | null;
  event_type: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export function activityEventQueries(sql: postgres.Sql) {
  return {
    async saveEvent(data: {
      id: string;
      projectId: string;
      userId: string;
      displayName: string | null;
      eventType: string;
      summary: string;
      metadata?: Record<string, unknown>;
    }): Promise<ActivityEventRow> {
      const [row] = await sql<ActivityEventRow[]>`
        INSERT INTO activity_events (id, project_id, user_id, display_name, event_type, summary, metadata)
        VALUES (
          ${data.id},
          ${data.projectId},
          ${data.userId},
          ${data.displayName},
          ${data.eventType},
          ${data.summary},
          ${data.metadata ? sql.json(data.metadata as Record<string, string | number | boolean | null>) : null}
        )
        RETURNING *
      `;
      return row!;
    },

    async getRecentEvents(projectId: string, limit: number = 50): Promise<ActivityEventRow[]> {
      return sql<ActivityEventRow[]>`
        SELECT * FROM activity_events
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `.then(rows => rows.reverse());
    },
  };
}
