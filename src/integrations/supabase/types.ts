export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      consultation_messages: {
        Row: {
          content: string
          context_snapshot: Json
          created_at: string
          field_id: string
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          context_snapshot?: Json
          created_at?: string
          field_id: string
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          context_snapshot?: Json
          created_at?: string
          field_id?: string
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_messages_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "consultation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_threads: {
        Row: {
          created_at: string
          expires_at: string
          field_id: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          field_id: string
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          field_id?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_threads_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnosis_records: {
        Row: {
          analysis_result: Json
          appearance_assessment: Json
          body_part: string | null
          candidates: Json
          checklist: Json
          confidence_band:
            | Database["public"]["Enums"]["confidence_band_enum"]
            | null
          created_at: string
          crop_name: string | null
          expires_at: string
          field_id: string | null
          field_snapshot: Json
          id: string
          image_name: string | null
          image_url: string | null
          limitations: Json
          recommended_photos: Json
          status: Database["public"]["Enums"]["diagnosis_status_enum"]
        }
        Insert: {
          analysis_result?: Json
          appearance_assessment?: Json
          body_part?: string | null
          candidates?: Json
          checklist?: Json
          confidence_band?:
            | Database["public"]["Enums"]["confidence_band_enum"]
            | null
          created_at?: string
          crop_name?: string | null
          expires_at?: string
          field_id?: string | null
          field_snapshot?: Json
          id?: string
          image_name?: string | null
          image_url?: string | null
          limitations?: Json
          recommended_photos?: Json
          status?: Database["public"]["Enums"]["diagnosis_status_enum"]
        }
        Update: {
          analysis_result?: Json
          appearance_assessment?: Json
          body_part?: string | null
          candidates?: Json
          checklist?: Json
          confidence_band?:
            | Database["public"]["Enums"]["confidence_band_enum"]
            | null
          created_at?: string
          crop_name?: string | null
          expires_at?: string
          field_id?: string | null
          field_snapshot?: Json
          id?: string
          image_name?: string | null
          image_url?: string | null
          limitations?: Json
          recommended_photos?: Json
          status?: Database["public"]["Enums"]["diagnosis_status_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "diagnosis_records_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      fields: {
        Row: {
          address: string | null
          area_m2: number
          created_at: string
          crop_name: string
          farmmap_meta: Json
          growth_stage: string | null
          id: string
          lat: number
          lng: number
          name: string
          owner_id: string | null
          pnu: string | null
          risk_level: Database["public"]["Enums"]["risk_level_enum"]
          risk_score: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          area_m2?: number
          created_at?: string
          crop_name: string
          farmmap_meta?: Json
          growth_stage?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          owner_id?: string | null
          pnu?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level_enum"]
          risk_score?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          area_m2?: number
          created_at?: string
          crop_name?: string
          farmmap_meta?: Json
          growth_stage?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          owner_id?: string | null
          pnu?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level_enum"]
          risk_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      nongsaro_work_video_recommendations: {
        Row: {
          created_at: string
          crop_name: string
          fetched_at: string
          field_id: string
          id: string
          judged_by: string
          match_score: number
          match_type: string
          reason: string
          schedule_source_id: string | null
          source_api: string
          sub_category_code: string | null
          updated_at: string
          video_img: string | null
          video_link: string
          video_origin_instt: string | null
          video_title: string
          work_item: string
          work_item_key: string
          work_item_period: string | null
        }
        Insert: {
          created_at?: string
          crop_name: string
          fetched_at: string
          field_id: string
          id?: string
          judged_by: string
          match_score: number
          match_type: string
          reason: string
          schedule_source_id?: string | null
          source_api?: string
          sub_category_code?: string | null
          updated_at?: string
          video_img?: string | null
          video_link: string
          video_origin_instt?: string | null
          video_title: string
          work_item: string
          work_item_key: string
          work_item_period?: string | null
        }
        Update: {
          created_at?: string
          crop_name?: string
          fetched_at?: string
          field_id?: string
          id?: string
          judged_by?: string
          match_score?: number
          match_type?: string
          reason?: string
          schedule_source_id?: string | null
          source_api?: string
          sub_category_code?: string | null
          updated_at?: string
          video_img?: string | null
          video_link?: string
          video_origin_instt?: string | null
          video_title?: string
          work_item?: string
          work_item_key?: string
          work_item_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nongsaro_work_video_recommendations_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      pest_risks: {
        Row: {
          candidate_name: string
          created_at: string
          crop_name: string
          field_id: string | null
          id: string
          official_sources: Json
          reasons: Json
          score: number
        }
        Insert: {
          candidate_name: string
          created_at?: string
          crop_name: string
          field_id?: string | null
          id?: string
          official_sources?: Json
          reasons?: Json
          score?: number
        }
        Update: {
          candidate_name?: string
          created_at?: string
          crop_name?: string
          field_id?: string | null
          id?: string
          official_sources?: Json
          reasons?: Json
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "pest_risks_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      pesticide_lookups: {
        Row: {
          crop: string
          id: string
          item: string
          max_uses: number | null
          pre_harvest_days: number | null
          source_url: string | null
          target: string
        }
        Insert: {
          crop: string
          id?: string
          item: string
          max_uses?: number | null
          pre_harvest_days?: number | null
          source_url?: string | null
          target: string
        }
        Update: {
          crop?: string
          id?: string
          item?: string
          max_uses?: number | null
          pre_harvest_days?: number | null
          source_url?: string | null
          target?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          field_id: string | null
          id: string
          period: string | null
          summary: Json
        }
        Insert: {
          created_at?: string
          field_id?: string | null
          id?: string
          period?: string | null
          summary?: Json
        }
        Update: {
          created_at?: string
          field_id?: string | null
          id?: string
          period?: string | null
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "reports_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      task_cards: {
        Row: {
          checks: Json
          completed_at: string | null
          created_at: string
          due_at: string | null
          duration_min: number | null
          field_id: string | null
          id: string
          priority: number
          reason: string | null
          sources: Json
          status: Database["public"]["Enums"]["task_status_enum"]
          title: string
        }
        Insert: {
          checks?: Json
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          duration_min?: number | null
          field_id?: string | null
          id?: string
          priority?: number
          reason?: string | null
          sources?: Json
          status?: Database["public"]["Enums"]["task_status_enum"]
          title: string
        }
        Update: {
          checks?: Json
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          duration_min?: number | null
          field_id?: string | null
          id?: string
          priority?: number
          reason?: string | null
          sources?: Json
          status?: Database["public"]["Enums"]["task_status_enum"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_cards_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_items: {
        Row: {
          created_at: string
          field_id: string
          id: string
          source_ids: string[]
          summary: string
          title: string
          type: Database["public"]["Enums"]["timeline_item_type_enum"]
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          source_ids?: string[]
          summary: string
          title: string
          type: Database["public"]["Enums"]["timeline_item_type_enum"]
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          source_ids?: string[]
          summary?: string
          title?: string
          type?: Database["public"]["Enums"]["timeline_item_type_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "timeline_items_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          notification_settings: Json
          owner_id: string
          selected_field_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          notification_settings?: Json
          owner_id?: string
          selected_field_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          notification_settings?: Json
          owner_id?: string
          selected_field_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_selected_field_id_fkey"
            columns: ["selected_field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_risks: {
        Row: {
          collected_at: string
          field_id: string | null
          forecast_at: string
          humidity: number | null
          id: string
          precipitation: number | null
          source_status: Database["public"]["Enums"]["source_status_enum"]
          summary: string | null
          temperature: number | null
          wind: number | null
        }
        Insert: {
          collected_at?: string
          field_id?: string | null
          forecast_at?: string
          humidity?: number | null
          id?: string
          precipitation?: number | null
          source_status?: Database["public"]["Enums"]["source_status_enum"]
          summary?: string | null
          temperature?: number | null
          wind?: number | null
        }
        Update: {
          collected_at?: string
          field_id?: string | null
          forecast_at?: string
          humidity?: number | null
          id?: string
          precipitation?: number | null
          source_status?: Database["public"]["Enums"]["source_status_enum"]
          summary?: string | null
          temperature?: number | null
          wind?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_risks_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_farm_infos: {
        Row: {
          created_at: string
          down_url: string | null
          down_url_list: Json
          file_name: string | null
          hit_ct: number | null
          id: string
          period_end: string | null
          period_start: string | null
          reg_dt: string | null
          source_key: string
          subject: string
          summary_fetched_at: string | null
          summary_model: string | null
          summary_payload: Json | null
          summary_status: string
          summary_text: string | null
          updated_at: string
          writer_nm: string | null
        }
        Insert: {
          created_at?: string
          down_url?: string | null
          down_url_list?: Json
          file_name?: string | null
          hit_ct?: number | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          reg_dt?: string | null
          source_key: string
          subject: string
          summary_fetched_at?: string | null
          summary_model?: string | null
          summary_payload?: Json | null
          summary_status?: string
          summary_text?: string | null
          updated_at?: string
          writer_nm?: string | null
        }
        Update: {
          created_at?: string
          down_url?: string | null
          down_url_list?: Json
          file_name?: string | null
          hit_ct?: number | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          reg_dt?: string | null
          source_key?: string
          subject?: string
          summary_fetched_at?: string | null
          summary_model?: string | null
          summary_payload?: Json | null
          summary_status?: string
          summary_text?: string | null
          updated_at?: string
          writer_nm?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_fieldguard_anonymous_workspace: {
        Args: { anonymous_owner_id: string }
        Returns: Json
      }
      current_fieldguard_owner_id: { Args: never; Returns: string }
      delete_expired_diagnosis_records: { Args: never; Returns: number }
      is_field_owner: { Args: { target_field_id: string }; Returns: boolean }
      purge_expired_consultation_threads: { Args: never; Returns: undefined }
    }
    Enums: {
      confidence_band_enum: "high" | "medium" | "low"
      diagnosis_status_enum:
        | "ready"
        | "uploading"
        | "analyzing"
        | "needs_more_photo"
        | "completed"
        | "limited"
        | "failed"
      risk_level_enum: "low" | "watch" | "high" | "critical" | "unknown"
      source_status_enum:
        | "connected"
        | "delayed"
        | "unavailable"
        | "rate_limited"
      task_status_enum:
        | "pending"
        | "in_progress"
        | "done"
        | "deferred"
        | "cancelled"
      timeline_item_type_enum:
        | "risk"
        | "task"
        | "photo"
        | "diagnosis"
        | "source"
        | "report"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      confidence_band_enum: ["high", "medium", "low"],
      diagnosis_status_enum: [
        "ready",
        "uploading",
        "analyzing",
        "needs_more_photo",
        "completed",
        "limited",
        "failed",
      ],
      risk_level_enum: ["low", "watch", "high", "critical", "unknown"],
      source_status_enum: [
        "connected",
        "delayed",
        "unavailable",
        "rate_limited",
      ],
      task_status_enum: [
        "pending",
        "in_progress",
        "done",
        "deferred",
        "cancelled",
      ],
      timeline_item_type_enum: [
        "risk",
        "task",
        "photo",
        "diagnosis",
        "source",
        "report",
      ],
    },
  },
} as const
