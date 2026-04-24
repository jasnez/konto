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
      profiles: {
        Row: {
          base_currency: string;
          created_at: string;
          deleted_at: string | null;
          display_name: string | null;
          id: string;
          locale: string;
          onboarding_completed_at: string | null;
          timezone: string;
          updated_at: string;
          week_start: number;
        };
        Insert: {
          base_currency?: string;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string | null;
          id: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          timezone?: string;
          updated_at?: string;
          week_start?: number;
        };
        Update: {
          base_currency?: string;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string | null;
          id?: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          timezone?: string;
          updated_at?: string;
          week_start?: number;
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
      transactions: {
        Row: {
          account_id: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      insert_default_categories: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      restore_default_categories_for_user: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      user_owns_account: { Args: { p_account_id: string }; Returns: boolean };
      user_owns_category: { Args: { p_category_id: string }; Returns: boolean };
      user_owns_merchant: { Args: { p_merchant_id: string }; Returns: boolean };
      user_owns_transaction: { Args: { p_tx_id: string }; Returns: boolean };
      search_merchants: {
        Args: { p_limit?: number; p_query: string };
        Returns: {
          id: string;
          canonical_name: string;
          color: string | null;
          default_category_id: string | null;
          display_name: string;
          icon: string | null;
          similarity_score: number;
          transaction_count: number;
        }[];
      };
      get_monthly_summary: {
        Args:
          | { p_base_currency: string; p_month: number; p_year: number }
          | {
              p_base_currency: string;
              p_month: number;
              p_today_date: string;
              p_year: number;
            };
        Returns: {
          avg_daily_spend: number;
          month_expense: number;
          month_income: number;
          month_net: number;
          net_change_percent: number;
          prev_month_net: number;
          total_balance: number;
        };
      };
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
