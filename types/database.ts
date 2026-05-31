export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
      conversations: {
        Row: {
          created_at: string
          deleted: boolean | null
          id: string
          messages: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted?: boolean | null
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted?: boolean | null
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          blocks: Json
          created_at: string
          id: string
          name: string
          position: number
          sections: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          blocks?: Json
          created_at?: string
          id?: string
          name: string
          position?: number
          sections?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          blocks?: Json
          created_at?: string
          id?: string
          name?: string
          position?: number
          sections?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          course_header: string
          id: number
        }
        Insert: {
          course_header: string
          id?: number
        }
        Update: {
          course_header?: string
          id?: number
        }
        Relationships: []
      }
      evaluation_sections: {
        Row: {
          evaluation_id: number
          section_id: number
        }
        Insert: {
          evaluation_id: number
          section_id: number
        }
        Update: {
          evaluation_id?: number
          section_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_sections_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          ces_link: string | null
          course_audience: number | null
          course_header: string
          course_questions: Json | null
          course_rating: number | null
          id: number
          instructor_id: number | null
          instructor_questions: Json | null
          instructor_rating: number | null
          response_rate: number | null
          responses_received: number | null
        }
        Insert: {
          ces_link?: string | null
          course_audience?: number | null
          course_header: string
          course_questions?: Json | null
          course_rating?: number | null
          id?: number
          instructor_id?: number | null
          instructor_questions?: Json | null
          instructor_rating?: number | null
          response_rate?: number | null
          responses_received?: number | null
        }
        Update: {
          ces_link?: string | null
          course_audience?: number | null
          course_header?: string
          course_questions?: Json | null
          course_rating?: number | null
          id?: number
          instructor_id?: number | null
          instructor_questions?: Json | null
          instructor_rating?: number | null
          response_rate?: number | null
          responses_received?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      section_instructors: {
        Row: {
          instructor_id: number
          section_id: number
        }
        Insert: {
          instructor_id: number
          section_id: number
        }
        Update: {
          instructor_id?: number
          section_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_instructors_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_instructors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          core_curriculum: string[] | null
          course_id: number
          embedding: string | null
          grade_data: Json | null
          id: number
          instruction_mode: string | null
          instructor_grades: Json | null
          register_url: string | null
          schedule_days: string[] | null
          schedule_hours: string[] | null
          schedule_location: string[] | null
          status: string | null
          summary: string | null
          term_id: number
        }
        Insert: {
          core_curriculum?: string[] | null
          course_id: number
          embedding?: string | null
          grade_data?: Json | null
          id: number
          instruction_mode?: string | null
          instructor_grades?: Json | null
          register_url?: string | null
          schedule_days?: string[] | null
          schedule_hours?: string[] | null
          schedule_location?: string[] | null
          status?: string | null
          summary?: string | null
          term_id: number
        }
        Update: {
          core_curriculum?: string[] | null
          course_id?: number
          embedding?: string | null
          grade_data?: Json | null
          id?: number
          instruction_mode?: string | null
          instructor_grades?: Json | null
          register_url?: string | null
          schedule_days?: string[] | null
          schedule_hours?: string[] | null
          schedule_location?: string[] | null
          status?: string | null
          summary?: string | null
          term_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_section_to_schedule: {
        Args: { p_id: string; p_section: Json }
        Returns: undefined
      }
      remove_section_from_schedule: {
        Args: { p_id: string; p_section_id: number }
        Returns: undefined
      }
      match_sections: {
        Args: { embedding: string; match_threshold: number }
        Returns: {
          core_curriculum: string[] | null
          course_id: number
          embedding: string | null
          grade_data: Json | null
          id: number
          instruction_mode: string | null
          instructor_grades: Json | null
          register_url: string | null
          schedule_days: string[] | null
          schedule_hours: string[] | null
          schedule_location: string[] | null
          status: string | null
          summary: string | null
          term_id: number
        }[]
      }
      match_sections_detailed: {
        Args: { embedding: string; match_threshold: number }
        Returns: {
          section_id: number
          course_header: string
          summary: string | null
          instruction_mode: string | null
          status: string | null
          register_url: string | null
          schedule_days: string[] | null
          schedule_hours: string[] | null
          schedule_location: string[] | null
          core_curriculum: string[] | null
          instructors: string[]
          grade_data: Json | null
          instructor_grades: Json | null
          evaluations: Json
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

