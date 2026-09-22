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
      agent_runs: {
        Row: {
          attempt: number
          ci_conclusion: string | null
          container_id: string | null
          cost_usd: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input_snapshot: Json
          kind: Database["public"]["Enums"]["run_kind"]
          model: string
          output: Json | null
          prompt_version: string
          spec_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          summary: string | null
          task_id: string
          tokens_in: number
          tokens_out: number
          transcript_path: string | null
        }
        Insert: {
          attempt?: number
          ci_conclusion?: string | null
          container_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_snapshot: Json
          kind: Database["public"]["Enums"]["run_kind"]
          model: string
          output?: Json | null
          prompt_version: string
          spec_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
          task_id: string
          tokens_in?: number
          tokens_out?: number
          transcript_path?: string | null
        }
        Update: {
          attempt?: number
          ci_conclusion?: string | null
          container_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_snapshot?: Json
          kind?: Database["public"]["Enums"]["run_kind"]
          model?: string
          output?: Json | null
          prompt_version?: string
          spec_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
          task_id?: string
          tokens_in?: number
          tokens_out?: number
          transcript_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_spec_id_fkey"
            columns: ["spec_id"]
            isOneToOne: false
            referencedRelation: "task_specs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author: Database["public"]["Enums"]["actor_kind"]
          body: string
          created_at: string
          id: string
          resolved: boolean
          spec_id: string | null
          task_id: string
        }
        Insert: {
          author: Database["public"]["Enums"]["actor_kind"]
          body: string
          created_at?: string
          id?: string
          resolved?: boolean
          spec_id?: string | null
          task_id: string
        }
        Update: {
          author?: Database["public"]["Enums"]["actor_kind"]
          body?: string
          created_at?: string
          id?: string
          resolved?: boolean
          spec_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_spec_id_fkey"
            columns: ["spec_id"]
            isOneToOne: false
            referencedRelation: "task_specs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      github_events: {
        Row: {
          action: string | null
          delivery_id: string
          error: string | null
          event: string
          payload: Json
          processed_at: string | null
          received_at: string
        }
        Insert: {
          action?: string | null
          delivery_id: string
          error?: string | null
          event: string
          payload: Json
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          action?: string | null
          delivery_id?: string
          error?: string | null
          event?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          default_branch: string
          github_installation_id: number | null
          id: string
          key_prefix: string
          name: string
          next_task_number: number
          owner_id: string
          repo_name: string
          repo_owner: string
          setup_commands: string[]
          test_commands: string[]
        }
        Insert: {
          created_at?: string
          default_branch?: string
          github_installation_id?: number | null
          id?: string
          key_prefix: string
          name: string
          next_task_number?: number
          owner_id: string
          repo_name: string
          repo_owner: string
          setup_commands?: string[]
          test_commands?: string[]
        }
        Update: {
          created_at?: string
          default_branch?: string
          github_installation_id?: number | null
          id?: string
          key_prefix?: string
          name?: string
          next_task_number?: number
          owner_id?: string
          repo_name?: string
          repo_owner?: string
          setup_commands?: string[]
          test_commands?: string[]
        }
        Relationships: []
      }
      run_logs: {
        Row: {
          created_at: string
          id: number
          kind: string
          level: string
          message: string
          payload: Json | null
          run_id: string
          seq: number
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          level: string
          message: string
          payload?: Json | null
          run_id: string
          seq: number
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          level?: string
          message?: string
          payload?: Json | null
          run_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "run_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          daily_budget_usd: number
          implement_model: string
          max_concurrent_impl: number
          owner_id: string
          refine_model: string
        }
        Insert: {
          daily_budget_usd?: number
          implement_model: string
          max_concurrent_impl?: number
          owner_id: string
          refine_model: string
        }
        Update: {
          daily_budget_usd?: number
          implement_model?: string
          max_concurrent_impl?: number
          owner_id?: string
          refine_model?: string
        }
        Relationships: []
      }
      task_events: {
        Row: {
          actor: Database["public"]["Enums"]["actor_kind"]
          created_at: string
          from_state: Database["public"]["Enums"]["task_state"] | null
          id: number
          reason: string | null
          task_id: string
          to_state: Database["public"]["Enums"]["task_state"]
        }
        Insert: {
          actor: Database["public"]["Enums"]["actor_kind"]
          created_at?: string
          from_state?: Database["public"]["Enums"]["task_state"] | null
          id?: never
          reason?: string | null
          task_id: string
          to_state: Database["public"]["Enums"]["task_state"]
        }
        Update: {
          actor?: Database["public"]["Enums"]["actor_kind"]
          created_at?: string
          from_state?: Database["public"]["Enums"]["task_state"] | null
          id?: never
          reason?: string | null
          task_id?: string
          to_state?: Database["public"]["Enums"]["task_state"]
        }
        Relationships: [
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_specs: {
        Row: {
          content: Json
          created_at: string
          created_by_run_id: string | null
          id: string
          task_id: string
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by_run_id?: string | null
          id?: string
          task_id: string
          version: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by_run_id?: string | null
          id?: string
          task_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_specs_created_by_run_id_fkey"
            columns: ["created_by_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_specs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_transitions: {
        Row: {
          actors: Database["public"]["Enums"]["actor_kind"][]
          from_state: Database["public"]["Enums"]["task_state"]
          to_state: Database["public"]["Enums"]["task_state"]
        }
        Insert: {
          actors: Database["public"]["Enums"]["actor_kind"][]
          from_state: Database["public"]["Enums"]["task_state"]
          to_state: Database["public"]["Enums"]["task_state"]
        }
        Update: {
          actors?: Database["public"]["Enums"]["actor_kind"][]
          from_state?: Database["public"]["Enums"]["task_state"]
          to_state?: Database["public"]["Enums"]["task_state"]
        }
        Relationships: []
      }
      tasks: {
        Row: {
          approved_spec_id: string | null
          blocked_reason: string | null
          branch: string | null
          created_at: string
          current_spec_id: string | null
          description: string
          id: string
          key: string
          labels: string[]
          locked_at: string | null
          locked_by: string | null
          owner_id: string
          position: number
          pr_number: number | null
          pr_url: string | null
          priority: number
          project_id: string
          state: Database["public"]["Enums"]["task_state"]
          title: string
          updated_at: string
        }
        Insert: {
          approved_spec_id?: string | null
          blocked_reason?: string | null
          branch?: string | null
          created_at?: string
          current_spec_id?: string | null
          description?: string
          id?: string
          key: string
          labels?: string[]
          locked_at?: string | null
          locked_by?: string | null
          owner_id: string
          position?: number
          pr_number?: number | null
          pr_url?: string | null
          priority?: number
          project_id: string
          state?: Database["public"]["Enums"]["task_state"]
          title: string
          updated_at?: string
        }
        Update: {
          approved_spec_id?: string | null
          blocked_reason?: string | null
          branch?: string | null
          created_at?: string
          current_spec_id?: string | null
          description?: string
          id?: string
          key?: string
          labels?: string[]
          locked_at?: string | null
          locked_by?: string | null
          owner_id?: string
          position?: number
          pr_number?: number | null
          pr_url?: string | null
          priority?: number
          project_id?: string
          state?: Database["public"]["Enums"]["task_state"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_approved_spec_id_fkey"
            columns: ["approved_spec_id"]
            isOneToOne: false
            referencedRelation: "task_specs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_current_spec_id_fkey"
            columns: ["current_spec_id"]
            isOneToOne: false
            referencedRelation: "task_specs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_task: {
        Args: {
          p_description?: string
          p_labels?: string[]
          p_priority?: number
          p_project_id: string
          p_title: string
        }
        Returns: {
          approved_spec_id: string | null
          blocked_reason: string | null
          branch: string | null
          created_at: string
          current_spec_id: string | null
          description: string
          id: string
          key: string
          labels: string[]
          locked_at: string | null
          locked_by: string | null
          owner_id: string
          position: number
          pr_number: number | null
          pr_url: string | null
          priority: number
          project_id: string
          state: Database["public"]["Enums"]["task_state"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enqueue_for_state: {
        Args: {
          p_from: Database["public"]["Enums"]["task_state"]
          p_patch: Json
          t: Database["public"]["Tables"]["tasks"]["Row"]
        }
        Returns: undefined
      }
      transition_task: {
        Args: {
          p_actor: Database["public"]["Enums"]["actor_kind"]
          p_patch?: Json
          p_reason?: string
          p_task_id: string
          p_to: Database["public"]["Enums"]["task_state"]
        }
        Returns: {
          approved_spec_id: string | null
          blocked_reason: string | null
          branch: string | null
          created_at: string
          current_spec_id: string | null
          description: string
          id: string
          key: string
          labels: string[]
          locked_at: string | null
          locked_by: string | null
          owner_id: string
          position: number
          pr_number: number | null
          pr_url: string | null
          priority: number
          project_id: string
          state: Database["public"]["Enums"]["task_state"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      actor_kind: "user" | "agent" | "github" | "system"
      run_kind: "refine" | "implement" | "address_review"
      run_status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
      task_state:
        | "draft"
        | "refining"
        | "awaiting_approval"
        | "ready_to_pull"
        | "in_progress"
        | "blocked"
        | "in_review"
        | "done"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      actor_kind: ["user", "agent", "github", "system"],
      run_kind: ["refine", "implement", "address_review"],
      run_status: ["queued", "running", "succeeded", "failed", "cancelled"],
      task_state: [
        "draft",
        "refining",
        "awaiting_approval",
        "ready_to_pull",
        "in_progress",
        "blocked",
        "in_review",
        "done",
        "cancelled",
      ],
    },
  },
} as const

