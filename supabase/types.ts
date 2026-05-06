export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number_last4: string | null;
          color: string | null;
          created_at: string;
          currency: string;
          current_balance_cents: number;
          deleted_at: string | null;
          icon: string | null;
          id: string;
          include_in_net_worth: boolean;
          initial_balance_cents: number;
          institution: string | null;
          institution_slug: string | null;
          is_active: boolean;
          name: string;
          sort_order: number;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_number_last4?: string | null;
          color?: string | null;
          created_at?: string;
          currency: string;
          current_balance_cents?: number;
          deleted_at?: string | null;
          icon?: string | null;
          id?: string;
          include_in_net_worth?: boolean;
          initial_balance_cents?: number;
          institution?: string | null;
          institution_slug?: string | null;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_number_last4?: string | null;
          color?: string | null;
          created_at?: string;
          currency?: string;
          current_balance_cents?: number;
          deleted_at?: string | null;
          icon?: string | null;
          id?: string;
          include_in_net_worth?: boolean;
          initial_balance_cents?: number;
          institution?: string | null;
          institution_slug?: string | null;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          created_at: string;
          event_data: Json | null;
          event_type: string;
          id: string;
          ip_hash: string | null;
          user_agent_hash: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_data?: Json | null;
          event_type: string;
          id?: string;
          ip_hash?: string | null;
          user_agent_hash?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_data?: Json | null;
          event_type?: string;
          id?: string;
          ip_hash?: string | null;
          user_agent_hash?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          active: boolean;
          amount_cents: number;
          category_id: string;
          created_at: string;
          currency: string;
          id: string;
          period: string;
          rollover: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          amount_cents: number;
          category_id: string;
          created_at?: string;
          currency?: string;
          id?: string;
          period: string;
          rollover?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          amount_cents?: number;
          category_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          period?: string;
          rollover?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'budgets_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          color: string | null;
          created_at: string;
          deleted_at: string | null;
          icon: string | null;
          id: string;
          is_system: boolean;
          kind: string;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          icon?: string | null;
          id?: string;
          is_system?: boolean;
          kind?: string;
          name: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          icon?: string | null;
          id?: string;
          is_system?: boolean;
          kind?: string;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      categorization_rules: {
        Row: {
          applied_count: number;
          created_at: string;
          id: string;
          is_active: boolean;
          match_account_id: string | null;
          match_amount_max_cents: number | null;
          match_amount_min_cents: number | null;
          match_amount_sign: string | null;
          match_description_pattern: string | null;
          match_merchant_pattern: string | null;
          match_merchant_pattern_type: string | null;
          name: string | null;
          priority: number;
          set_category_id: string | null;
          set_is_excluded: boolean | null;
          set_is_transfer: boolean | null;
          set_merchant_id: string | null;
          set_tags: string[] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          applied_count?: number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          match_account_id?: string | null;
          match_amount_max_cents?: number | null;
          match_amount_min_cents?: number | null;
          match_amount_sign?: string | null;
          match_description_pattern?: string | null;
          match_merchant_pattern?: string | null;
          match_merchant_pattern_type?: string | null;
          name?: string | null;
          priority?: number;
          set_category_id?: string | null;
          set_is_excluded?: boolean | null;
          set_is_transfer?: boolean | null;
          set_merchant_id?: string | null;
          set_tags?: string[] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          applied_count?: number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          match_account_id?: string | null;
          match_amount_max_cents?: number | null;
          match_amount_min_cents?: number | null;
          match_amount_sign?: string | null;
          match_description_pattern?: string | null;
          match_merchant_pattern?: string | null;
          match_merchant_pattern_type?: string | null;
          name?: string | null;
          priority?: number;
          set_category_id?: string | null;
          set_is_excluded?: boolean | null;
          set_is_transfer?: boolean | null;
          set_merchant_id?: string | null;
          set_tags?: string[] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categorization_rules_match_account_id_fkey';
            columns: ['match_account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'categorization_rules_set_category_id_fkey';
            columns: ['set_category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'categorization_rules_set_merchant_id_fkey';
            columns: ['set_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      deletion_cancel_tokens: {
        Row: {
          consumed_at: string;
          expires_at: string;
          jti: string;
          user_id: string;
        };
        Insert: {
          consumed_at?: string;
          expires_at: string;
          jti: string;
          user_id: string;
        };
        Update: {
          consumed_at?: string;
          expires_at?: string;
          jti?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      fx_rates: {
        Row: {
          base: string;
          date: string;
          fetched_at: string;
          quote: string;
          rate: number;
          source: string;
        };
        Insert: {
          base?: string;
          date: string;
          fetched_at?: string;
          quote: string;
          rate: number;
          source?: string;
        };
        Update: {
          base?: string;
          date?: string;
          fetched_at?: string;
          quote?: string;
          rate?: number;
          source?: string;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          account_id: string | null;
          achieved_at: string | null;
          active: boolean;
          color: string | null;
          created_at: string;
          currency: string;
          current_amount_cents: number;
          icon: string | null;
          id: string;
          name: string;
          target_amount_cents: number;
          target_date: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id?: string | null;
          achieved_at?: string | null;
          active?: boolean;
          color?: string | null;
          created_at?: string;
          currency?: string;
          current_amount_cents?: number;
          icon?: string | null;
          id?: string;
          name: string;
          target_amount_cents: number;
          target_date?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string | null;
          achieved_at?: string | null;
          active?: boolean;
          color?: string | null;
          created_at?: string;
          currency?: string;
          current_amount_cents?: number;
          icon?: string | null;
          id?: string;
          name?: string;
          target_amount_cents?: number;
          target_date?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goals_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      ignored_recurring_candidates: {
        Row: {
          group_key: string;
          ignored_at: string;
          user_id: string;
        };
        Insert: {
          group_key: string;
          ignored_at?: string;
          user_id: string;
        };
        Update: {
          group_key?: string;
          ignored_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          account_id: string | null;
          checksum: string;
          created_at: string;
          dedup_skipped: number;
          error_message: string | null;
          id: string;
          imported_at: string | null;
          original_filename: string;
          parse_confidence: string | null;
          parse_warnings: Json | null;
          statement_period_end: string | null;
          statement_period_start: string | null;
          status: string;
          storage_path: string | null;
          transaction_count: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id?: string | null;
          checksum: string;
          created_at?: string;
          dedup_skipped?: number;
          error_message?: string | null;
          id?: string;
          imported_at?: string | null;
          original_filename: string;
          parse_confidence?: string | null;
          parse_warnings?: Json | null;
          statement_period_end?: string | null;
          statement_period_start?: string | null;
          status?: string;
          storage_path?: string | null;
          transaction_count?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string | null;
          checksum?: string;
          created_at?: string;
          dedup_skipped?: number;
          error_message?: string | null;
          id?: string;
          imported_at?: string | null;
          original_filename?: string;
          parse_confidence?: string | null;
          parse_warnings?: Json | null;
          statement_period_end?: string | null;
          statement_period_start?: string | null;
          status?: string;
          storage_path?: string | null;
          transaction_count?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'import_batches_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      insights: {
        Row: {
          action_url: string | null;
          body: string;
          created_at: string;
          dedup_key: string;
          dismissed_at: string | null;
          id: string;
          metadata: Json;
          severity: string;
          title: string;
          type: string;
          updated_at: string;
          user_id: string;
          valid_until: string | null;
        };
        Insert: {
          action_url?: string | null;
          body: string;
          created_at?: string;
          dedup_key: string;
          dismissed_at?: string | null;
          id?: string;
          metadata?: Json;
          severity: string;
          title: string;
          type: string;
          updated_at?: string;
          user_id: string;
          valid_until?: string | null;
        };
        Update: {
          action_url?: string | null;
          body?: string;
          created_at?: string;
          dedup_key?: string;
          dismissed_at?: string | null;
          id?: string;
          metadata?: Json;
          severity?: string;
          title?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
          valid_until?: string | null;
        };
        Relationships: [];
      };
      installment_occurrences: {
        Row: {
          amount_cents: number;
          created_at: string;
          due_date: string;
          id: string;
          occurrence_num: number;
          plan_id: string;
          state: string;
          transaction_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          due_date: string;
          id?: string;
          occurrence_num: number;
          plan_id: string;
          state?: string;
          transaction_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          due_date?: string;
          id?: string;
          occurrence_num?: number;
          plan_id?: string;
          state?: string;
          transaction_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'installment_occurrences_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'installment_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'installment_occurrences_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
        ];
      };
      installment_plans: {
        Row: {
          account_id: string;
          category_id: string | null;
          created_at: string;
          currency: string;
          day_of_month: number;
          id: string;
          installment_cents: number;
          installment_count: number;
          merchant_id: string | null;
          notes: string | null;
          start_date: string;
          status: string;
          total_cents: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          category_id?: string | null;
          created_at?: string;
          currency: string;
          day_of_month: number;
          id?: string;
          installment_cents: number;
          installment_count: number;
          merchant_id?: string | null;
          notes?: string | null;
          start_date: string;
          status?: string;
          total_cents: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string;
          category_id?: string | null;
          created_at?: string;
          currency?: string;
          day_of_month?: number;
          id?: string;
          installment_cents?: number;
          installment_count?: number;
          merchant_id?: string | null;
          notes?: string | null;
          start_date?: string;
          status?: string;
          total_cents?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'installment_plans_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'installment_plans_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'installment_plans_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      invite_codes: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          notes: string | null;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          notes?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          notes?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [];
      };
      llm_categorization_cache: {
        Row: {
          amount_bucket: number;
          category_id: string | null;
          confidence: number;
          created_at: string;
          currency: string;
          description_normalized: string;
          expires_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          amount_bucket: number;
          category_id?: string | null;
          confidence: number;
          created_at?: string;
          currency: string;
          description_normalized: string;
          expires_at: string;
          id?: string;
          user_id: string;
        };
        Update: {
          amount_bucket?: number;
          category_id?: string | null;
          confidence?: number;
          created_at?: string;
          currency?: string;
          description_normalized?: string;
          expires_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'llm_categorization_cache_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_aliases: {
        Row: {
          created_at: string;
          id: string;
          merchant_id: string;
          pattern: string;
          pattern_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          merchant_id: string;
          pattern: string;
          pattern_type?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          merchant_id?: string;
          pattern?: string;
          pattern_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_aliases_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      merchants: {
        Row: {
          canonical_name: string;
          color: string | null;
          created_at: string;
          default_category_id: string | null;
          deleted_at: string | null;
          display_name: string;
          icon: string | null;
          id: string;
          notes: string | null;
          transaction_count: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          canonical_name: string;
          color?: string | null;
          created_at?: string;
          default_category_id?: string | null;
          deleted_at?: string | null;
          display_name: string;
          icon?: string | null;
          id?: string;
          notes?: string | null;
          transaction_count?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          canonical_name?: string;
          color?: string | null;
          created_at?: string;
          default_category_id?: string | null;
          deleted_at?: string | null;
          display_name?: string;
          icon?: string | null;
          id?: string;
          notes?: string | null;
          transaction_count?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchants_default_category_id_fkey';
            columns: ['default_category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      parsed_transactions: {
        Row: {
          amount_minor: number;
          batch_id: string;
          categorization_confidence: number | null;
          categorization_source: string | null;
          category_id: string | null;
          convert_to_transfer_to_account_id: string | null;
          created_at: string;
          currency: string;
          id: string;
          merchant_id: string | null;
          parse_confidence: string | null;
          raw_description: string;
          reference: string | null;
          selected_for_import: boolean;
          status: string;
          transaction_date: string;
          transaction_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_minor: number;
          batch_id: string;
          categorization_confidence?: number | null;
          categorization_source?: string | null;
          category_id?: string | null;
          convert_to_transfer_to_account_id?: string | null;
          created_at?: string;
          currency: string;
          id?: string;
          merchant_id?: string | null;
          parse_confidence?: string | null;
          raw_description: string;
          reference?: string | null;
          selected_for_import?: boolean;
          status?: string;
          transaction_date: string;
          transaction_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_minor?: number;
          batch_id?: string;
          categorization_confidence?: number | null;
          categorization_source?: string | null;
          category_id?: string | null;
          convert_to_transfer_to_account_id?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          merchant_id?: string | null;
          parse_confidence?: string | null;
          raw_description?: string;
          reference?: string | null;
          selected_for_import?: boolean;
          status?: string;
          transaction_date?: string;
          transaction_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'parsed_transactions_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'import_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'parsed_transactions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'parsed_transactions_convert_to_transfer_to_account_id_fkey';
            columns: ['convert_to_transfer_to_account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'parsed_transactions_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'parsed_transactions_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          base_currency: string;
          created_at: string;
          dashboard_section_order: Json | null;
          deleted_at: string | null;
          display_name: string | null;
          id: string;
          locale: string;
          onboarding_completed: Json;
          onboarding_completed_at: string | null;
          timezone: string;
          updated_at: string;
          week_start: number;
        };
        Insert: {
          base_currency?: string;
          created_at?: string;
          dashboard_section_order?: Json | null;
          deleted_at?: string | null;
          display_name?: string | null;
          id: string;
          locale?: string;
          onboarding_completed?: Json;
          onboarding_completed_at?: string | null;
          timezone?: string;
          updated_at?: string;
          week_start?: number;
        };
        Update: {
          base_currency?: string;
          created_at?: string;
          dashboard_section_order?: Json | null;
          deleted_at?: string | null;
          display_name?: string | null;
          id?: string;
          locale?: string;
          onboarding_completed?: Json;
          onboarding_completed_at?: string | null;
          timezone?: string;
          updated_at?: string;
          week_start?: number;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      receipt_scans: {
        Row: {
          created_at: string;
          error_message: string | null;
          extracted_at: string | null;
          extracted_json: Json | null;
          id: string;
          mime: string;
          size_bytes: number;
          status: string;
          storage_path: string;
          transaction_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          extracted_at?: string | null;
          extracted_json?: Json | null;
          id?: string;
          mime: string;
          size_bytes: number;
          status?: string;
          storage_path: string;
          transaction_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          extracted_at?: string | null;
          extracted_json?: Json | null;
          id?: string;
          mime?: string;
          size_bytes?: number;
          status?: string;
          storage_path?: string;
          transaction_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'receipt_scans_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
        ];
      };
      recurring_transactions: {
        Row: {
          account_id: string | null;
          active: boolean;
          average_amount_cents: number;
          category_id: string | null;
          created_at: string;
          currency: string;
          description: string;
          detection_confidence: number | null;
          id: string;
          last_seen_date: string | null;
          merchant_id: string | null;
          next_expected_date: string | null;
          occurrences: number;
          paused_until: string | null;
          period: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id?: string | null;
          active?: boolean;
          average_amount_cents: number;
          category_id?: string | null;
          created_at?: string;
          currency: string;
          description: string;
          detection_confidence?: number | null;
          id?: string;
          last_seen_date?: string | null;
          merchant_id?: string | null;
          next_expected_date?: string | null;
          occurrences?: number;
          paused_until?: string | null;
          period: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string | null;
          active?: boolean;
          average_amount_cents?: number;
          category_id?: string | null;
          created_at?: string;
          currency?: string;
          description?: string;
          detection_confidence?: number | null;
          id?: string;
          last_seen_date?: string | null;
          merchant_id?: string | null;
          next_expected_date?: string | null;
          occurrences?: number;
          paused_until?: string | null;
          period?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recurring_transactions_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recurring_transactions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recurring_transactions_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
        ];
      };
      transactions: {
        Row: {
          account_id: string;
          account_ledger_cents: number;
          attachments: Json | null;
          base_amount_cents: number;
          base_currency: string;
          category_confidence: number | null;
          category_id: string | null;
          category_source: string | null;
          created_at: string;
          dedup_hash: string | null;
          deleted_at: string | null;
          description: string | null;
          external_id: string | null;
          fx_rate: number | null;
          fx_rate_date: string | null;
          fx_stale: boolean | null;
          id: string;
          import_batch_id: string | null;
          is_excluded: boolean;
          is_pending: boolean;
          is_reconciled: boolean;
          is_recurring: boolean;
          is_transfer: boolean;
          latitude: number | null;
          longitude: number | null;
          merchant_id: string | null;
          merchant_raw: string | null;
          notes: string | null;
          original_amount_cents: number;
          original_currency: string;
          posted_date: string | null;
          receipt_scan_id: string | null;
          recurring_group_id: string | null;
          source: string;
          split_parent_id: string | null;
          tags: string[] | null;
          transaction_date: string;
          transfer_pair_id: string | null;
          updated_at: string;
          user_id: string;
          value_date: string | null;
        };
        Insert: {
          account_id: string;
          account_ledger_cents: number;
          attachments?: Json | null;
          base_amount_cents: number;
          base_currency: string;
          category_confidence?: number | null;
          category_id?: string | null;
          category_source?: string | null;
          created_at?: string;
          dedup_hash?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          external_id?: string | null;
          fx_rate?: number | null;
          fx_rate_date?: string | null;
          fx_stale?: boolean | null;
          id?: string;
          import_batch_id?: string | null;
          is_excluded?: boolean;
          is_pending?: boolean;
          is_reconciled?: boolean;
          is_recurring?: boolean;
          is_transfer?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          merchant_id?: string | null;
          merchant_raw?: string | null;
          notes?: string | null;
          original_amount_cents: number;
          original_currency: string;
          posted_date?: string | null;
          receipt_scan_id?: string | null;
          recurring_group_id?: string | null;
          source: string;
          split_parent_id?: string | null;
          tags?: string[] | null;
          transaction_date: string;
          transfer_pair_id?: string | null;
          updated_at?: string;
          user_id: string;
          value_date?: string | null;
        };
        Update: {
          account_id?: string;
          account_ledger_cents?: number;
          attachments?: Json | null;
          base_amount_cents?: number;
          base_currency?: string;
          category_confidence?: number | null;
          category_id?: string | null;
          category_source?: string | null;
          created_at?: string;
          dedup_hash?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          external_id?: string | null;
          fx_rate?: number | null;
          fx_rate_date?: string | null;
          fx_stale?: boolean | null;
          id?: string;
          import_batch_id?: string | null;
          is_excluded?: boolean;
          is_pending?: boolean;
          is_reconciled?: boolean;
          is_recurring?: boolean;
          is_transfer?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          merchant_id?: string | null;
          merchant_raw?: string | null;
          notes?: string | null;
          original_amount_cents?: number;
          original_currency?: string;
          posted_date?: string | null;
          receipt_scan_id?: string | null;
          recurring_group_id?: string | null;
          source?: string;
          split_parent_id?: string | null;
          tags?: string[] | null;
          transaction_date?: string;
          transfer_pair_id?: string | null;
          updated_at?: string;
          user_id?: string;
          value_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_import_batch_id_fkey';
            columns: ['import_batch_id'];
            isOneToOne: false;
            referencedRelation: 'import_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_receipt_scan_id_fkey';
            columns: ['receipt_scan_id'];
            isOneToOne: false;
            referencedRelation: 'receipt_scans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_recurring_group_id_fkey';
            columns: ['recurring_group_id'];
            isOneToOne: false;
            referencedRelation: 'recurring_transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_split_parent_id_fkey';
            columns: ['split_parent_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_transfer_pair_id_fkey';
            columns: ['transfer_pair_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
        ];
      };
      user_corrections: {
        Row: {
          confidence_before: number | null;
          created_at: string;
          description_normalized: string | null;
          description_raw: string | null;
          field: string;
          id: string;
          new_value: string | null;
          new_value_json: Json | null;
          old_value: string | null;
          old_value_json: Json | null;
          source_before: string | null;
          transaction_id: string | null;
          user_id: string;
        };
        Insert: {
          confidence_before?: number | null;
          created_at?: string;
          description_normalized?: string | null;
          description_raw?: string | null;
          field: string;
          id?: string;
          new_value?: string | null;
          new_value_json?: Json | null;
          old_value?: string | null;
          old_value_json?: Json | null;
          source_before?: string | null;
          transaction_id?: string | null;
          user_id: string;
        };
        Update: {
          confidence_before?: number | null;
          created_at?: string;
          description_normalized?: string | null;
          description_raw?: string | null;
          field?: string;
          id?: string;
          new_value?: string | null;
          new_value_json?: Json | null;
          old_value?: string | null;
          old_value_json?: Json | null;
          source_before?: string | null;
          transaction_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_corrections_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      check_rate_limit_and_record: {
        Args: {
          p_action: string;
          p_limit: number;
          p_user_id: string;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      confirm_recurring: { Args: { p_payload: Json }; Returns: Json };
      convert_transaction_to_transfer: {
        Args: { p_counterparty_account_id: string; p_transaction_id: string };
        Returns: Json;
      };
      count_receipt_scans_today: { Args: never; Returns: number };
      create_transfer_pair: {
        Args: {
          p_base_currency: string;
          p_from_account_id: string;
          p_from_amount_cents: number;
          p_from_base_cents: number;
          p_from_currency: string;
          p_from_fx_rate: number;
          p_from_fx_rate_date: string;
          p_from_fx_stale: boolean;
          p_notes: string;
          p_to_account_id: string;
          p_to_amount_cents: number;
          p_to_base_cents: number;
          p_to_currency: string;
          p_to_fx_rate: number;
          p_to_fx_rate_date: string;
          p_to_fx_stale: boolean;
          p_transaction_date: string;
        };
        Returns: Json;
      };
      finalize_import_batch: {
        Args: { p_batch_id: string; p_dedup_skipped?: number; p_rows: Json };
        Returns: Json;
      };
      get_account_balance_history: {
        Args: { p_days?: number };
        Returns: {
          account_id: string;
          balance_cents: number;
          day: string;
        }[];
      };
      get_current_period_spent: {
        Args: { p_budget_id: string };
        Returns: number;
      };
      get_monthly_summary:
        | {
            Args: { p_base_currency: string; p_month: number; p_year: number };
            Returns: Json;
          }
        | {
            Args: {
              p_base_currency: string;
              p_month: number;
              p_today_date: string;
              p_year: number;
            };
            Returns: Json;
          };
      get_period_spent_for_category: {
        Args: { p_category_id: string; p_offset?: number; p_period: string };
        Returns: number;
      };
      get_recurring_with_history: {
        Args: { p_recurring_id: string };
        Returns: Json;
      };
      get_spending_by_category: {
        Args: {
          p_base_currency?: string;
          p_offset?: number;
          p_period: string;
          p_today_date?: string;
        };
        Returns: {
          amount_cents: number;
          category_color: string;
          category_icon: string;
          category_id: string;
          category_name: string;
          category_slug: string;
          monthly_history: number[];
          prev_amount_cents: number;
        }[];
      };
      import_dedup_filter: {
        Args: { p_account_id: string; p_rows: Json };
        Returns: number[];
      };
      insert_default_categories: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      normalize_for_categorization: {
        Args: { p_input: string };
        Returns: string;
      };
      preview_invite_code: { Args: { p_code: string }; Returns: string };
      recompute_goal_from_account: {
        Args: { p_goal_id: string };
        Returns: undefined;
      };
      restore_default_categories_for_user: { Args: never; Returns: undefined };
      run_categorization_cascade: {
        Args: { p_amount_minor: number; p_description: string };
        Returns: Json;
      };
      search_merchants: {
        Args: { p_limit?: number; p_query: string };
        Returns: {
          canonical_name: string;
          color: string;
          default_category_id: string;
          display_name: string;
          icon: string;
          id: string;
          similarity_score: number;
          transaction_count: number;
        }[];
      };
      set_dashboard_section_order: {
        Args: { p_order: string[] };
        Returns: undefined;
      };
      user_owns_account: { Args: { p_account_id: string }; Returns: boolean };
      user_owns_account_row: {
        Args: { p_account_id: string };
        Returns: boolean;
      };
      user_owns_budgetable_category: {
        Args: { p_category_id: string };
        Returns: boolean;
      };
      user_owns_category: { Args: { p_category_id: string }; Returns: boolean };
      user_owns_merchant: { Args: { p_merchant_id: string }; Returns: boolean };
      user_owns_transaction: { Args: { p_tx_id: string }; Returns: boolean };
      user_owns_transaction_row: { Args: { p_tx_id: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
