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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      aeo_analytics: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          page_slug: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          page_slug?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          page_slug?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          aeo_score: number | null
          ai_generated_at: string | null
          author: string | null
          category: string | null
          content: string
          created_at: string | null
          id: string
          keywords: string[] | null
          meta_description: string | null
          published_at: string | null
          reviewed_at: string | null
          slug: string
          source_data: Json | null
          status: string | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          aeo_score?: number | null
          ai_generated_at?: string | null
          author?: string | null
          category?: string | null
          content: string
          created_at?: string | null
          id?: string
          keywords?: string[] | null
          meta_description?: string | null
          published_at?: string | null
          reviewed_at?: string | null
          slug: string
          source_data?: Json | null
          status?: string | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          aeo_score?: number | null
          ai_generated_at?: string | null
          author?: string | null
          category?: string | null
          content?: string
          created_at?: string | null
          id?: string
          keywords?: string[] | null
          meta_description?: string | null
          published_at?: string | null
          reviewed_at?: string | null
          slug?: string
          source_data?: Json | null
          status?: string | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      blog_topics: {
        Row: {
          created_at: string | null
          id: string
          last_checked: string | null
          priority_score: number | null
          search_volume: number | null
          source: string | null
          topic: string
          trend_direction: string | null
          used: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_checked?: string | null
          priority_score?: number | null
          search_volume?: number | null
          source?: string | null
          topic: string
          trend_direction?: string | null
          used?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_checked?: string | null
          priority_score?: number | null
          search_volume?: number | null
          source?: string | null
          topic?: string
          trend_direction?: string | null
          used?: boolean | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          drivers_license: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string
          postal_code: string | null
          sms_opt_in: boolean | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          drivers_license: string
          email: string
          first_name: string
          id?: string
          last_name: string
          phone: string
          postal_code?: string | null
          sms_opt_in?: boolean | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          drivers_license?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string
          postal_code?: string | null
          sms_opt_in?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      page_content: {
        Row: {
          bullets: Json
          city: string | null
          content: string | null
          created_at: string
          faqs: Json
          h1: string
          hook: string | null
          how: string | null
          id: string
          jsonld: string | null
          local_info: string | null
          meta_description: string
          meta_title: string
          next: string | null
          slug: string
          stats: Json | null
          updated_at: string
          video: Json | null
          violation: string | null
          what: string | null
        }
        Insert: {
          bullets?: Json
          city?: string | null
          content?: string | null
          created_at?: string
          faqs?: Json
          h1: string
          hook?: string | null
          how?: string | null
          id?: string
          jsonld?: string | null
          local_info?: string | null
          meta_description: string
          meta_title: string
          next?: string | null
          slug: string
          stats?: Json | null
          updated_at?: string
          video?: Json | null
          violation?: string | null
          what?: string | null
        }
        Update: {
          bullets?: Json
          city?: string | null
          content?: string | null
          created_at?: string
          faqs?: Json
          h1?: string
          hook?: string | null
          how?: string | null
          id?: string
          jsonld?: string | null
          local_info?: string | null
          meta_description?: string
          meta_title?: string
          next?: string | null
          slug?: string
          stats?: Json | null
          updated_at?: string
          video?: Json | null
          violation?: string | null
          what?: string | null
        }
        Relationships: []
      }
      ticket_submissions: {
        Row: {
          additional_notes: string | null
          address: string | null
          assigned_to: string | null
          city: string | null
          client_id: string
          consent_form_path: string | null
          coupon_code: string | null
          court_date: string | null
          court_location: string | null
          created_at: string | null
          date_of_birth: string | null
          defense_strategy: string | null
          drivers_license: string | null
          email: string
          fine_amount: string
          first_name: string
          id: string
          insurance_company: string | null
          last_name: string
          phone: string
          postal_code: string | null
          search_vector: unknown | null
          sms_opt_in: boolean | null
          status: string | null
          ticket_number: string
          updated_at: string | null
          violation: string
          violation_date: string | null
          violation_time: string | null
        }
        Insert: {
          additional_notes?: string | null
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          client_id: string
          consent_form_path?: string | null
          coupon_code?: string | null
          court_date?: string | null
          court_location?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          defense_strategy?: string | null
          drivers_license?: string | null
          email: string
          fine_amount: string
          first_name: string
          id?: string
          insurance_company?: string | null
          last_name: string
          phone: string
          postal_code?: string | null
          search_vector?: unknown | null
          sms_opt_in?: boolean | null
          status?: string | null
          ticket_number: string
          updated_at?: string | null
          violation: string
          violation_date?: string | null
          violation_time?: string | null
        }
        Update: {
          additional_notes?: string | null
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          client_id?: string
          consent_form_path?: string | null
          coupon_code?: string | null
          court_date?: string | null
          court_location?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          defense_strategy?: string | null
          drivers_license?: string | null
          email?: string
          fine_amount?: string
          first_name?: string
          id?: string
          insurance_company?: string | null
          last_name?: string
          phone?: string
          postal_code?: string | null
          search_vector?: unknown | null
          sms_opt_in?: boolean | null
          status?: string | null
          ticket_number?: string
          updated_at?: string | null
          violation?: string
          violation_date?: string | null
          violation_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      aeo_kpi_summary: {
        Row: {
          event_date: string | null
          event_type: string | null
          total_events: number | null
          unique_pages: number | null
          unique_sessions: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_aeo_kpi_summary: {
        Args: Record<PropertyKey, never>
        Returns: {
          event_date: string | null
          event_type: string | null
          total_events: number | null
          unique_pages: number | null
          unique_sessions: number | null
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "case_manager" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "case_manager", "user"],
    },
  },
} as const
