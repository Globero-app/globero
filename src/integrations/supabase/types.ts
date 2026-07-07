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
  public: {
    Tables: {
      app_config: {
        Row: {
          accent_color: string
          button_color: string
          display_font: string
          font_family: string
          id: number
          primary_color: string
          team_name: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          button_color?: string
          display_font?: string
          font_family?: string
          id?: number
          primary_color?: string
          team_name?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          button_color?: string
          display_font?: string
          font_family?: string
          id?: number
          primary_color?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      bike_components: {
        Row: {
          active: boolean
          bike_id: string
          component_type: string
          created_at: string
          id: string
          install_km: number
          installed_at: string
          lifespan_km: number
          name: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          bike_id: string
          component_type: string
          created_at?: string
          id?: string
          install_km?: number
          installed_at?: string
          lifespan_km?: number
          name?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          bike_id?: string
          component_type?: string
          created_at?: string
          id?: string
          install_km?: number
          installed_at?: string
          lifespan_km?: number
          name?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bike_components_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
      }
      bikes: {
        Row: {
          bike_type: string | null
          brand: string | null
          created_at: string
          current_km: number
          id: string
          model: string | null
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bike_type?: string | null
          brand?: string | null
          created_at?: string
          current_km?: number
          id?: string
          model?: string | null
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bike_type?: string | null
          brand?: string | null
          created_at?: string
          current_km?: number
          id?: string
          model?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      competitions: {
        Row: {
          created_at: string
          date: string
          distance_km: number
          duration_hours: number | null
          elevation_m: number
          gpx_data: string | null
          gpx_filename: string | null
          hydration_plan: Json | null
          id: string
          intensity: string | null
          menu_plan: Json | null
          name: string
          notes: string | null
          nutrition_plan: Json | null
          race_feedback: Json | null
          track_points: Json | null
          type: string
          updated_at: string
          user_id: string
          waypoints: Json | null
          weather_forecast: Json | null
        }
        Insert: {
          created_at?: string
          date: string
          distance_km?: number
          duration_hours?: number | null
          elevation_m?: number
          gpx_data?: string | null
          gpx_filename?: string | null
          hydration_plan?: Json | null
          id?: string
          intensity?: string | null
          menu_plan?: Json | null
          name: string
          notes?: string | null
          nutrition_plan?: Json | null
          race_feedback?: Json | null
          track_points?: Json | null
          type?: string
          updated_at?: string
          user_id: string
          waypoints?: Json | null
          weather_forecast?: Json | null
        }
        Update: {
          created_at?: string
          date?: string
          distance_km?: number
          duration_hours?: number | null
          elevation_m?: number
          gpx_data?: string | null
          gpx_filename?: string | null
          hydration_plan?: Json | null
          id?: string
          intensity?: string | null
          menu_plan?: Json | null
          name?: string
          notes?: string | null
          nutrition_plan?: Json | null
          race_feedback?: Json | null
          track_points?: Json | null
          type?: string
          updated_at?: string
          user_id?: string
          waypoints?: Json | null
          weather_forecast?: Json | null
        }
        Relationships: []
      }
      hrv_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          note: string | null
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          created_at: string
          dietary_preferences: string | null
          email: string
          ftp: number | null
          full_name: string | null
          gender: string | null
          height_cm: number | null
          hrv_push_enabled: boolean
          hrv_push_hour: number
          id: string
          notify_maintenance_email: boolean
          notify_maintenance_push: boolean
          notify_prerace_push: boolean
          notify_strava_push: boolean
          notify_training_push: boolean
          nutrition_focus: string
          onboarding_completed_at: string | null
          pre_race_days: number
          strava_access_token: string | null
          strava_athlete_id: number | null
          strava_client_id: string | null
          strava_client_secret: string | null
          strava_expires_at: number | null
          strava_refresh_token: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          age?: number | null
          created_at?: string
          dietary_preferences?: string | null
          email: string
          ftp?: number | null
          full_name?: string | null
          gender?: string | null
          height_cm?: number | null
          hrv_push_enabled?: boolean
          hrv_push_hour?: number
          id: string
          notify_maintenance_email?: boolean
          notify_maintenance_push?: boolean
          notify_prerace_push?: boolean
          notify_strava_push?: boolean
          notify_training_push?: boolean
          nutrition_focus?: string
          onboarding_completed_at?: string | null
          pre_race_days?: number
          strava_access_token?: string | null
          strava_athlete_id?: number | null
          strava_client_id?: string | null
          strava_client_secret?: string | null
          strava_expires_at?: number | null
          strava_refresh_token?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          age?: number | null
          created_at?: string
          dietary_preferences?: string | null
          email?: string
          ftp?: number | null
          full_name?: string | null
          gender?: string | null
          height_cm?: number | null
          hrv_push_enabled?: boolean
          hrv_push_hour?: number
          id?: string
          notify_maintenance_email?: boolean
          notify_maintenance_push?: boolean
          notify_prerace_push?: boolean
          notify_strava_push?: boolean
          notify_training_push?: boolean
          nutrition_focus?: string
          onboarding_completed_at?: string | null
          pre_race_days?: number
          strava_access_token?: string | null
          strava_athlete_id?: number | null
          strava_client_id?: string | null
          strava_client_secret?: string | null
          strava_expires_at?: number | null
          strava_refresh_token?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sponsors: {
        Row: {
          active: boolean
          created_at: string
          id: string
          logo_url: string
          name: string
          sort_order: number
          updated_at: string
          website_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url: string
          name: string
          sort_order?: number
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string
          name?: string
          sort_order?: number
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      strava_activities: {
        Row: {
          average_heartrate: number | null
          average_speed: number | null
          average_watts: number | null
          distance: number | null
          id: number
          moving_time: number | null
          name: string | null
          raw: Json | null
          start_date: string | null
          suffer_score: number | null
          synced_at: string
          total_elevation_gain: number | null
          type: string | null
          user_id: string
        }
        Insert: {
          average_heartrate?: number | null
          average_speed?: number | null
          average_watts?: number | null
          distance?: number | null
          id: number
          moving_time?: number | null
          name?: string | null
          raw?: Json | null
          start_date?: string | null
          suffer_score?: number | null
          synced_at?: string
          total_elevation_gain?: number | null
          type?: string | null
          user_id: string
        }
        Update: {
          average_heartrate?: number | null
          average_speed?: number | null
          average_watts?: number | null
          distance?: number | null
          id?: number
          moving_time?: number | null
          name?: string | null
          raw?: Json | null
          start_date?: string | null
          suffer_score?: number | null
          synced_at?: string
          total_elevation_gain?: number | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          bike_type: string
          completed_at: string | null
          created_at: string
          duration_minutes: number
          feedback_notes: string | null
          id: string
          plan: Json
          rpe: number | null
          status: string
          training_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bike_type: string
          completed_at?: string | null
          created_at?: string
          duration_minutes: number
          feedback_notes?: string | null
          id?: string
          plan: Json
          rpe?: number | null
          status?: string
          training_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bike_type?: string
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number
          feedback_notes?: string | null
          id?: string
          plan?: Json
          rpe?: number | null
          status?: string
          training_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
