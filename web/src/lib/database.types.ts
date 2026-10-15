export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      areas: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          lat: number | null
          lng: number | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: never
          lat?: number | null
          lng?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: never
          lat?: number | null
          lng?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ascents: {
        Row: {
          aid: string | null
          comment: string | null
          grade: string | null
          grade_rank: number | null
          id: number
          name: string | null
          pitches: number | null
          place_id: number | null
          position: number
          route_id: number | null
          style: string | null
          visit_id: number
        }
        Insert: {
          aid?: string | null
          comment?: string | null
          grade?: string | null
          grade_rank?: number | null
          id?: never
          name?: string | null
          pitches?: number | null
          place_id?: number | null
          position?: number
          route_id?: number | null
          style?: string | null
          visit_id: number
        }
        Update: {
          aid?: string | null
          comment?: string | null
          grade?: string | null
          grade_rank?: number | null
          id?: never
          name?: string | null
          pitches?: number | null
          place_id?: number | null
          position?: number
          route_id?: number | null
          style?: string | null
          visit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ascents_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ascents_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ascents_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ascents_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          area_id: number | null
          created_at: string
          created_by: string
          distance_km: number | null
          elapsed_s: number | null
          gain_m: number | null
          id: number
          kind: string
          loss_m: number | null
          max_ele_m: number | null
          min_ele_m: number | null
          moving_s: number | null
          place_id: number | null
          private: boolean
          size_bytes: number | null
          storage_path: string | null
          title: string | null
          uphill_s: number | null
          url: string | null
          visit_id: number | null
        }
        Insert: {
          area_id?: number | null
          created_at?: string
          created_by?: string
          distance_km?: number | null
          elapsed_s?: number | null
          gain_m?: number | null
          id?: never
          kind: string
          loss_m?: number | null
          max_ele_m?: number | null
          min_ele_m?: number | null
          moving_s?: number | null
          place_id?: number | null
          private?: boolean
          size_bytes?: number | null
          storage_path?: string | null
          title?: string | null
          uphill_s?: number | null
          url?: string | null
          visit_id?: number | null
        }
        Update: {
          area_id?: number | null
          created_at?: string
          created_by?: string
          distance_km?: number | null
          elapsed_s?: number | null
          gain_m?: number | null
          id?: never
          kind?: string
          loss_m?: number | null
          max_ele_m?: number | null
          min_ele_m?: number | null
          moving_s?: number | null
          place_id?: number | null
          private?: boolean
          size_bytes?: number | null
          storage_path?: string | null
          title?: string | null
          uphill_s?: number | null
          url?: string | null
          visit_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          file_name: string
          id: number
          summary: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: never
          summary?: Json
          user_id?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: never
          summary?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          id: number
          linked_user_id: string | null
          name: string
          owner_id: string
        }
        Insert: {
          id?: never
          linked_user_id?: string | null
          name: string
          owner_id?: string
        }
        Update: {
          id?: never
          linked_user_id?: string | null
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_linked_user_id_fkey"
            columns: ["linked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string
          height: number | null
          id: number
          place_id: number | null
          size_bytes: number | null
          storage_path: string
          thumb_path: string
          visit_id: number | null
          width: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string
          height?: number | null
          id?: never
          place_id?: number | null
          size_bytes?: number | null
          storage_path: string
          thumb_path: string
          visit_id?: number | null
          width?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string
          height?: number | null
          id?: never
          place_id?: number | null
          size_bytes?: number | null
          storage_path?: string
          thumb_path?: string
          visit_id?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          activity: string
          aid: string | null
          alpine_grade: string | null
          area_id: number | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          distance_km: number | null
          elevation_gain: number | null
          exposition: string[]
          grade: string | null
          grade_obligatory: string | null
          grade_obligatory_rank: number | null
          id: number
          lat: number
          length_m: number | null
          lng: number
          location: unknown
          max_altitude: number | null
          name: string
          parking_lat: number | null
          parking_lng: number | null
          pitches: number | null
          protection: string | null
          province: string | null
          rock: string | null
          sector_id: number | null
          start_lat: number | null
          start_lng: number | null
          start_locality: string | null
          updated_at: string
        }
        Insert: {
          activity?: string
          aid?: string | null
          alpine_grade?: string | null
          area_id?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          distance_km?: number | null
          elevation_gain?: number | null
          exposition?: string[]
          grade?: string | null
          grade_obligatory?: string | null
          grade_obligatory_rank?: number | null
          id?: never
          lat: number
          length_m?: number | null
          lng: number
          location?: unknown
          max_altitude?: number | null
          name: string
          parking_lat?: number | null
          parking_lng?: number | null
          pitches?: number | null
          protection?: string | null
          province?: string | null
          rock?: string | null
          sector_id?: number | null
          start_lat?: number | null
          start_lng?: number | null
          start_locality?: string | null
          updated_at?: string
        }
        Update: {
          activity?: string
          aid?: string | null
          alpine_grade?: string | null
          area_id?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          distance_km?: number | null
          elevation_gain?: number | null
          exposition?: string[]
          grade?: string | null
          grade_obligatory?: string | null
          grade_obligatory_rank?: number | null
          id?: never
          lat?: number
          length_m?: number | null
          lng?: number
          location?: unknown
          max_altitude?: number | null
          name?: string
          parking_lat?: number | null
          parking_lng?: number | null
          pitches?: number | null
          protection?: string | null
          province?: string | null
          rock?: string | null
          sector_id?: number | null
          start_lat?: number | null
          start_lng?: number | null
          start_locality?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "places_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "places_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          language: string | null
          role: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          language?: string | null
          role?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
          role?: string
          username?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          created_at: string
          created_by: string | null
          grade: string | null
          grade_rank: number | null
          id: number
          name: string
          place_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          grade?: string | null
          grade_rank?: number | null
          id?: never
          name: string
          place_id: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          grade?: string | null
          grade_rank?: number | null
          id?: never
          name?: string
          place_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          area_id: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          max_altitude: number | null
          name: string
          updated_at: string
        }
        Insert: {
          area_id?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: never
          max_altitude?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          area_id?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: never
          max_altitude?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sectors_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spot_comments: {
        Row: {
          body: string
          created_at: string
          id: number
          observed_on: string | null
          place_id: number | null
          sector_id: number | null
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          observed_on?: string | null
          place_id?: number | null
          sector_id?: number | null
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          observed_on?: string | null
          place_id?: number | null
          sector_id?: number | null
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spot_comments_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spot_comments_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spot_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_partners: {
        Row: {
          partner_id: number
          same_rope: boolean
          visit_id: number
        }
        Insert: {
          partner_id: number
          same_rope?: boolean
          visit_id: number
        }
        Update: {
          partner_id?: number
          same_rope?: boolean
          visit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "visit_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_partners_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_partners_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          approach: string | null
          conditions: string | null
          created_at: string
          date: string | null
          descent: string | null
          duration_hours: number | null
          id: number
          import_id: number | null
          place_id: number
          rating: number | null
          summary: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          approach?: string | null
          conditions?: string | null
          created_at?: string
          date?: string | null
          descent?: string | null
          duration_hours?: number | null
          id?: never
          import_id?: number | null
          place_id: number
          rating?: number | null
          summary?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Update: {
          approach?: string | null
          conditions?: string | null
          created_at?: string
          date?: string | null
          descent?: string | null
          duration_hours?: number | null
          id?: never
          import_id?: number | null
          place_id?: number
          rating?: number | null
          summary?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist: {
        Row: {
          created_at: string
          done_at: string | null
          done_visit_id: number | null
          id: number
          notes: string | null
          place_id: number
          priority: number
          seasons: string[]
          user_id: string
          visibility: string
          with_people: string[]
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          done_visit_id?: number | null
          id?: never
          notes?: string | null
          place_id: number
          priority?: number
          seasons?: string[]
          user_id?: string
          visibility?: string
          with_people?: string[]
        }
        Update: {
          created_at?: string
          done_at?: string | null
          done_visit_id?: number | null
          id?: never
          notes?: string | null
          place_id?: number
          priority?: number
          seasons?: string[]
          user_id?: string
          visibility?: string
          with_people?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_done_visit_id_fkey"
            columns: ["done_visit_id"]
            isOneToOne: false
            referencedRelation: "visit_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_done_visit_id_fkey"
            columns: ["done_visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      visit_overview: {
        Row: {
          area_id: number | null
          area_name: string | null
          ascent_count: number | null
          conditions: string | null
          date: string | null
          duration_hours: number | null
          grades: string[] | null
          id: number | null
          max_grade_rank: number | null
          max_sent_grade_rank: number | null
          partner_ids: number[] | null
          partner_names: string[] | null
          pitches_climbed: number | null
          place_activity: string | null
          place_id: number | null
          place_name: string | null
          rating: number | null
          search_text: string | null
          sector_id: number | null
          sector_name: string | null
          summary: string | null
          track_distance_km: number | null
          track_gain_m: number | null
          user_id: string | null
          username: string | null
          visibility: string | null
          wall_names: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "places_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "places_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_delete_place: { Args: { p_place_id: number }; Returns: boolean }
      can_edit_area: { Args: { p_area_id: number }; Returns: boolean }
      can_edit_place: { Args: { p_place_id: number }; Returns: boolean }
      can_edit_sector: { Args: { p_sector_id: number }; Returns: boolean }
      complete_wish: {
        Args: { p_visit_id: number; p_wish_id: number }
        Returns: undefined
      }
      delete_user: {
        Args: { p_check_only?: boolean; p_user_id: string }
        Returns: undefined
      }
      duplicate_areas: {
        Args: never
        Returns: {
          area_id: number
          other_id: number
          similarity: number
        }[]
      }
      duplicate_places: {
        Args: never
        Returns: {
          distance_km: number
          other_id: number
          place_id: number
          similarity: number
        }[]
      }
      fold_name: { Args: { t: string }; Returns: string }
      grade_rank: { Args: { grade: string }; Returns: number }
      import_logbook: { Args: { p: Json }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          last_active_at: string
          last_visit: string
          public_visits: number
          role: string
          spots_added: number
          username: string
          visits: number
        }[]
      }
      merge_areas: {
        Args: { p_duplicate: number; p_keep: number }
        Returns: Json
      }
      merge_places: {
        Args: { p_duplicate: number; p_keep: number }
        Returns: Json
      }
      partner_on_readable_visit: {
        Args: { p_partner_id: number }
        Returns: boolean
      }
      places_within: {
        Args: { p_lat: number; p_lng: number; radius_km: number }
        Returns: {
          distance_km: number
          place_id: number
        }[]
      }
      publish_track: {
        Args: { p_attachment_id: number; p_public_path: string }
        Returns: undefined
      }
      reopen_wish: { Args: { p_wish_id: number }; Returns: undefined }
      save_place: { Args: { p: Json }; Returns: number }
      save_visit: { Args: { v: Json }; Returns: number }
      set_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      similar_areas: {
        Args: { names: string[] }
        Returns: {
          area_id: number
          name: string
          place_count: number
          query: string
          similarity: number
        }[]
      }
      similar_places: {
        Args: { p: Json }
        Returns: {
          activity: string
          area_name: string
          distance_km: number
          key: string
          lat: number
          lng: number
          name: string
          place_id: number
          sector_name: string
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

