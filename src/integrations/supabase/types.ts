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
      coach_alerts: {
        Row: {
          alert_date: string
          created_at: string
          dismissed_at: string | null
          id: string
          kind: string
          message: string
          severity: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_date: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind: string
          message: string
          severity?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_date?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind?: string
          message?: string
          severity?: string
          title?: string
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
      daily_activities: {
        Row: {
          activity_id: string
          created_at: string
          date: string
          feedback_completed: boolean
          feel: number | null
          id: string
          match_notified_at: string | null
          notification_sent: boolean
          rpe: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          date?: string
          feedback_completed?: boolean
          feel?: number | null
          id?: string
          match_notified_at?: string | null
          notification_sent?: boolean
          rpe?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          date?: string
          feedback_completed?: boolean
          feel?: number | null
          id?: string
          match_notified_at?: string | null
          notification_sent?: boolean
          rpe?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      error_log: {
        Row: {
          created_at: string
          id: string
          message: string
          source: string
          stack: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          source: string
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          source?: string
          stack?: string | null
          user_id?: string | null
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
      intervals_activities: {
        Row: {
          average_heartrate: number | null
          average_speed: number | null
          average_watts: number | null
          distance: number | null
          icu_intensity: number | null
          icu_training_load: number | null
          id: string
          max_heartrate: number | null
          moving_time: number | null
          name: string | null
          raw: Json | null
          start_date: string | null
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
          icu_intensity?: number | null
          icu_training_load?: number | null
          id: string
          max_heartrate?: number | null
          moving_time?: number | null
          name?: string | null
          raw?: Json | null
          start_date?: string | null
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
          icu_intensity?: number | null
          icu_training_load?: number | null
          id?: string
          max_heartrate?: number | null
          moving_time?: number | null
          name?: string | null
          raw?: Json | null
          start_date?: string | null
          synced_at?: string
          total_elevation_gain?: number | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          created_at: string
          details: Json | null
          job_name: string
          last_run_at: string | null
          locked_until: string
          paused_until: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          job_name: string
          last_run_at?: string | null
          locked_until?: string
          paused_until?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          job_name?: string
          last_run_at?: string | null
          locked_until?: string
          paused_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          attempts: number
          body: string
          channel: string
          created_at: string
          error: string | null
          id: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          attempts?: number
          body: string
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      power_peaks: {
        Row: {
          activity_date: string
          activity_id: string
          created_at: string
          duration_seconds: number
          id: string
          updated_at: string
          user_id: string
          watts: number
          wkg: number | null
        }
        Insert: {
          activity_date: string
          activity_id: string
          created_at?: string
          duration_seconds: number
          id?: string
          updated_at?: string
          user_id: string
          watts: number
          wkg?: number | null
        }
        Update: {
          activity_date?: string
          activity_id?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          updated_at?: string
          user_id?: string
          watts?: number
          wkg?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          created_at: string
          cyclist_type: Database["public"]["Enums"]["cyclist_type_enum"]
          dietary_preferences: string | null
          email: string
          ftp: number | null
          ftp_test_completed_at: string | null
          full_name: string | null
          gender: string | null
          height_cm: number | null
          id: string
          intervals_api_key: string | null
          intervals_athlete_id: string | null
          intervals_oauth: boolean
          intervals_refresh_token: string | null
          intervals_token_expires_at: string | null
          linking_code: string | null
          location_city: string | null
          lthr: number | null
          max_hr: number | null
          notify_channel: string
          notify_daily_brief: boolean
          notify_fatigue_alerts: boolean
          notify_maintenance_email: boolean
          notify_maintenance_push: boolean
          notify_prerace_push: boolean
          notify_strava_push: boolean
          notify_training_push: boolean
          nutrition_focus: string
          nutrition_goal: string
          nutrition_plan_enabled: boolean
          onboarding_completed_at: string | null
          pre_race_days: number
          readiness_push_enabled: boolean
          readiness_push_hour: number
          strava_access_token: string | null
          strava_athlete_id: number | null
          strava_client_id: string | null
          strava_client_secret: string | null
          strava_expires_at: number | null
          strava_refresh_token: string | null
          strengths: string | null
          telegram_chat_id: string | null
          updated_at: string
          weaknesses: string | null
          weather_auto_indoor: boolean
          weather_wind_threshold_kmh: number
          weekly_auto_enabled: boolean
          weekly_bike_type: string
          weekly_duration_minutes: number
          weekly_last_generated_at: string | null
          weekly_long_ride_day: number | null
          weekly_target_basis: string
          weekly_training_days: number[]
          weight_kg: number | null
          zones_display_mode: string
        }
        Insert: {
          age?: number | null
          created_at?: string
          cyclist_type?: Database["public"]["Enums"]["cyclist_type_enum"]
          dietary_preferences?: string | null
          email: string
          ftp?: number | null
          ftp_test_completed_at?: string | null
          full_name?: string | null
          gender?: string | null
          height_cm?: number | null
          id: string
          intervals_api_key?: string | null
          intervals_athlete_id?: string | null
          intervals_oauth?: boolean
          intervals_refresh_token?: string | null
          intervals_token_expires_at?: string | null
          linking_code?: string | null
          location_city?: string | null
          lthr?: number | null
          max_hr?: number | null
          notify_channel?: string
          notify_daily_brief?: boolean
          notify_fatigue_alerts?: boolean
          notify_maintenance_email?: boolean
          notify_maintenance_push?: boolean
          notify_prerace_push?: boolean
          notify_strava_push?: boolean
          notify_training_push?: boolean
          nutrition_focus?: string
          nutrition_goal?: string
          nutrition_plan_enabled?: boolean
          onboarding_completed_at?: string | null
          pre_race_days?: number
          readiness_push_enabled?: boolean
          readiness_push_hour?: number
          strava_access_token?: string | null
          strava_athlete_id?: number | null
          strava_client_id?: string | null
          strava_client_secret?: string | null
          strava_expires_at?: number | null
          strava_refresh_token?: string | null
          strengths?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          weaknesses?: string | null
          weather_auto_indoor?: boolean
          weather_wind_threshold_kmh?: number
          weekly_auto_enabled?: boolean
          weekly_bike_type?: string
          weekly_duration_minutes?: number
          weekly_last_generated_at?: string | null
          weekly_long_ride_day?: number | null
          weekly_target_basis?: string
          weekly_training_days?: number[]
          weight_kg?: number | null
          zones_display_mode?: string
        }
        Update: {
          age?: number | null
          created_at?: string
          cyclist_type?: Database["public"]["Enums"]["cyclist_type_enum"]
          dietary_preferences?: string | null
          email?: string
          ftp?: number | null
          ftp_test_completed_at?: string | null
          full_name?: string | null
          gender?: string | null
          height_cm?: number | null
          id?: string
          intervals_api_key?: string | null
          intervals_athlete_id?: string | null
          intervals_oauth?: boolean
          intervals_refresh_token?: string | null
          intervals_token_expires_at?: string | null
          linking_code?: string | null
          location_city?: string | null
          lthr?: number | null
          max_hr?: number | null
          notify_channel?: string
          notify_daily_brief?: boolean
          notify_fatigue_alerts?: boolean
          notify_maintenance_email?: boolean
          notify_maintenance_push?: boolean
          notify_prerace_push?: boolean
          notify_strava_push?: boolean
          notify_training_push?: boolean
          nutrition_focus?: string
          nutrition_goal?: string
          nutrition_plan_enabled?: boolean
          onboarding_completed_at?: string | null
          pre_race_days?: number
          readiness_push_enabled?: boolean
          readiness_push_hour?: number
          strava_access_token?: string | null
          strava_athlete_id?: number | null
          strava_client_id?: string | null
          strava_client_secret?: string | null
          strava_expires_at?: number | null
          strava_refresh_token?: string | null
          strengths?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          weaknesses?: string | null
          weather_auto_indoor?: boolean
          weather_wind_threshold_kmh?: number
          weekly_auto_enabled?: boolean
          weekly_bike_type?: string
          weekly_duration_minutes?: number
          weekly_last_generated_at?: string | null
          weekly_long_ride_day?: number | null
          weekly_target_basis?: string
          weekly_training_days?: number[]
          weight_kg?: number | null
          zones_display_mode?: string
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
      readiness_entries: {
        Row: {
          ai_action: string | null
          ai_message: string | null
          created_at: string
          entry_date: string
          id: string
          note: string | null
          score: number
          updated_at: string
          user_id: string
          workout_id: string | null
        }
        Insert: {
          ai_action?: string | null
          ai_message?: string | null
          created_at?: string
          entry_date: string
          id?: string
          note?: string | null
          score: number
          updated_at?: string
          user_id: string
          workout_id?: string | null
        }
        Update: {
          ai_action?: string | null
          ai_message?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          note?: string | null
          score?: number
          updated_at?: string
          user_id?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "readiness_entries_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          active: boolean
          block_key: string
          block_type: string
          body: string | null
          created_at: string
          icon: string | null
          id: string
          section: string
          sort_order: number
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          block_key: string
          block_type?: string
          body?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          section: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          block_key?: string
          block_type?: string
          body?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          section?: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string
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
      sync_log: {
        Row: {
          created_at: string
          id: string
          items: number
          kind: string
          message: string | null
          ok: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: number
          kind: string
          message?: string | null
          ok?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: number
          kind?: string
          message?: string | null
          ok?: boolean
          user_id?: string
        }
        Relationships: []
      }
      training_blocks: {
        Row: {
          competition_id: string | null
          created_at: string
          focus: string
          id: string
          notes: string | null
          start_date: string
          target_tss: number | null
          updated_at: string
          user_id: string
          week_index: number
        }
        Insert: {
          competition_id?: string | null
          created_at?: string
          focus?: string
          id?: string
          notes?: string | null
          start_date: string
          target_tss?: number | null
          updated_at?: string
          user_id: string
          week_index?: number
        }
        Update: {
          competition_id?: string | null
          created_at?: string
          focus?: string
          id?: string
          notes?: string | null
          start_date?: string
          target_tss?: number | null
          updated_at?: string
          user_id?: string
          week_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_blocks_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
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
      weekly_nutrition_plans: {
        Row: {
          created_at: string
          goal: string
          id: string
          plan: Json
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          goal?: string
          id?: string
          plan: Json
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          plan?: Json
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          actual_if: number | null
          actual_tss: number | null
          bike_type: string
          completed_at: string | null
          compliance: number | null
          created_at: string
          duration_minutes: number
          feedback_notes: string | null
          id: string
          plan: Json
          planned_tss: number | null
          rpe: number | null
          status: string
          training_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_if?: number | null
          actual_tss?: number | null
          bike_type: string
          completed_at?: string | null
          compliance?: number | null
          created_at?: string
          duration_minutes: number
          feedback_notes?: string | null
          id?: string
          plan: Json
          planned_tss?: number | null
          rpe?: number | null
          status?: string
          training_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_if?: number | null
          actual_tss?: number | null
          bike_type?: string
          completed_at?: string | null
          compliance?: number | null
          created_at?: string
          duration_minutes?: number
          feedback_notes?: string | null
          id?: string
          plan?: Json
          planned_tss?: number | null
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
      cyclist_type_enum:
        | "sprinter"
        | "rodador"
        | "escalador"
        | "contrarrelojista"
        | "mixto"
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
      cyclist_type_enum: [
        "sprinter",
        "rodador",
        "escalador",
        "contrarrelojista",
        "mixto",
      ],
    },
  },
} as const
