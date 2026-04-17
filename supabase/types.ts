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
      competitor_products: {
        Row: {
          brand: string | null
          category: string
          click_count: number | null
          click_rate: number | null
          collected_at: string
          coupang_product_id: string | null
          created_at: string | null
          id: number
          impression_count: number | null
          item_winner_price: number | null
          product_name: string
          rank: number | null
          rating: number | null
          release_date: string | null
          review_count: number | null
          search_keyword: string | null
        }
        Insert: {
          brand?: string | null
          category: string
          click_count?: number | null
          click_rate?: number | null
          collected_at: string
          coupang_product_id?: string | null
          created_at?: string | null
          id?: never
          impression_count?: number | null
          item_winner_price?: number | null
          product_name: string
          rank?: number | null
          rating?: number | null
          release_date?: string | null
          review_count?: number | null
          search_keyword?: string | null
        }
        Update: {
          brand?: string | null
          category?: string
          click_count?: number | null
          click_rate?: number | null
          collected_at?: string
          coupang_product_id?: string | null
          created_at?: string | null
          id?: never
          impression_count?: number | null
          item_winner_price?: number | null
          product_name?: string
          rank?: number | null
          rating?: number | null
          release_date?: string | null
          review_count?: number | null
          search_keyword?: string | null
        }
        Relationships: []
      }
      daily_performance: {
        Row: {
          amv: number | null
          asp: number | null
          avg_rating: number | null
          avg_spend_per_customer: number | null
          cogs: number | null
          conversion_rate: number | null
          coupang_extra_discount: number | null
          coupon_discount: number | null
          created_at: string | null
          customer_count: number | null
          gmv: number | null
          id: number
          instant_discount: number | null
          order_count: number | null
          page_views: number | null
          promo_gmv: number | null
          promo_units_sold: number | null
          return_units: number | null
          review_count: number | null
          sale_date: string
          sku_id: string
          sns_cogs: number | null
          sns_gmv: number | null
          sns_ratio: number | null
          sns_return_units: number | null
          sns_units_sold: number | null
          units_sold: number | null
          vendor_item_id: string
          vendor_item_name: string | null
        }
        Insert: {
          amv?: number | null
          asp?: number | null
          avg_rating?: number | null
          avg_spend_per_customer?: number | null
          cogs?: number | null
          conversion_rate?: number | null
          coupang_extra_discount?: number | null
          coupon_discount?: number | null
          created_at?: string | null
          customer_count?: number | null
          gmv?: number | null
          id?: never
          instant_discount?: number | null
          order_count?: number | null
          page_views?: number | null
          promo_gmv?: number | null
          promo_units_sold?: number | null
          return_units?: number | null
          review_count?: number | null
          sale_date: string
          sku_id: string
          sns_cogs?: number | null
          sns_gmv?: number | null
          sns_ratio?: number | null
          sns_return_units?: number | null
          sns_units_sold?: number | null
          units_sold?: number | null
          vendor_item_id: string
          vendor_item_name?: string | null
        }
        Update: {
          amv?: number | null
          asp?: number | null
          avg_rating?: number | null
          avg_spend_per_customer?: number | null
          cogs?: number | null
          conversion_rate?: number | null
          coupang_extra_discount?: number | null
          coupon_discount?: number | null
          created_at?: string | null
          customer_count?: number | null
          gmv?: number | null
          id?: never
          instant_discount?: number | null
          order_count?: number | null
          page_views?: number | null
          promo_gmv?: number | null
          promo_units_sold?: number | null
          return_units?: number | null
          review_count?: number | null
          sale_date?: string
          sku_id?: string
          sns_cogs?: number | null
          sns_gmv?: number | null
          sns_ratio?: number | null
          sns_return_units?: number | null
          sns_units_sold?: number | null
          units_sold?: number | null
          vendor_item_id?: string
          vendor_item_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_performance_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
        ]
      }
      data_sync_log: {
        Row: {
          error_message: string | null
          id: number
          max_date_after: string | null
          max_date_before: string | null
          rows_inserted: number | null
          rows_skipped: number | null
          rows_updated: number | null
          source_file: string | null
          status: string | null
          synced_at: string | null
          table_name: string
        }
        Insert: {
          error_message?: string | null
          id?: never
          max_date_after?: string | null
          max_date_before?: string | null
          rows_inserted?: number | null
          rows_skipped?: number | null
          rows_updated?: number | null
          source_file?: string | null
          status?: string | null
          synced_at?: string | null
          table_name: string
        }
        Update: {
          error_message?: string | null
          id?: never
          max_date_after?: string | null
          max_date_before?: string | null
          rows_inserted?: number | null
          rows_skipped?: number | null
          rows_updated?: number | null
          source_file?: string | null
          status?: string | null
          synced_at?: string | null
          table_name?: string
        }
        Relationships: []
      }
      inbound_staging: {
        Row: {
          counterparty: string | null
          erp_code: string | null
          erp_item_name_raw: string | null
          erp_system: string | null
          erp_tx_no: string | null
          is_internal: boolean | null
          memo: string | null
          quantity: number | null
          supply_amount: number | null
          total_amount: number | null
          tx_date: string | null
          tx_type: string | null
          unit_price: number | null
          vat: number | null
        }
        Insert: {
          counterparty?: string | null
          erp_code?: string | null
          erp_item_name_raw?: string | null
          erp_system?: string | null
          erp_tx_no?: string | null
          is_internal?: boolean | null
          memo?: string | null
          quantity?: number | null
          supply_amount?: number | null
          total_amount?: number | null
          tx_date?: string | null
          tx_type?: string | null
          unit_price?: number | null
          vat?: number | null
        }
        Update: {
          counterparty?: string | null
          erp_code?: string | null
          erp_item_name_raw?: string | null
          erp_system?: string | null
          erp_tx_no?: string | null
          is_internal?: boolean | null
          memo?: string | null
          quantity?: number | null
          supply_amount?: number | null
          total_amount?: number | null
          tx_date?: string | null
          tx_type?: string | null
          unit_price?: number | null
          vat?: number | null
        }
        Relationships: []
      }
      inventory_operation: {
        Row: {
          category_stockout_rate: number | null
          center: string | null
          confirmed_fulfillment_rate: number | null
          created_at: string | null
          current_stock: number | null
          id: number
          inbound_qty: number | null
          is_stockout: boolean | null
          op_date: string
          order_fulfillment_rate: number | null
          order_status: string | null
          order_status_detail: string | null
          outbound_qty: number | null
          purchase_cost: number | null
          return_rate: number | null
          return_reason: string | null
          sku_id: string
        }
        Insert: {
          category_stockout_rate?: number | null
          center?: string | null
          confirmed_fulfillment_rate?: number | null
          created_at?: string | null
          current_stock?: number | null
          id?: never
          inbound_qty?: number | null
          is_stockout?: boolean | null
          op_date: string
          order_fulfillment_rate?: number | null
          order_status?: string | null
          order_status_detail?: string | null
          outbound_qty?: number | null
          purchase_cost?: number | null
          return_rate?: number | null
          return_reason?: string | null
          sku_id: string
        }
        Update: {
          category_stockout_rate?: number | null
          center?: string | null
          confirmed_fulfillment_rate?: number | null
          created_at?: string | null
          current_stock?: number | null
          id?: never
          inbound_qty?: number | null
          is_stockout?: boolean | null
          op_date?: string
          order_fulfillment_rate?: number | null
          order_status?: string | null
          order_status_detail?: string | null
          outbound_qty?: number | null
          purchase_cost?: number | null
          return_rate?: number | null
          return_reason?: string | null
          sku_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_operation_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
        ]
      }
      item_coupang_mapping: {
        Row: {
          bundle_ratio: number
          channel_variant: string | null
          coupang_product_id: string | null
          coupang_sku_id: string
          created_at: string
          id: number
          item_id: number
          mapping_source: string | null
          mapping_status: string
          notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          bundle_ratio?: number
          channel_variant?: string | null
          coupang_product_id?: string | null
          coupang_sku_id: string
          created_at?: string
          id?: number
          item_id: number
          mapping_source?: string | null
          mapping_status?: string
          notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          bundle_ratio?: number
          channel_variant?: string | null
          coupang_product_id?: string | null
          coupang_sku_id?: string
          created_at?: string
          id?: number
          item_id?: number
          mapping_source?: string | null
          mapping_status?: string
          notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_coupang_mapping_coupang_sku_id_fkey"
            columns: ["coupang_sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
          {
            foreignKeyName: "item_coupang_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_master"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_coupang_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_sales"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_coupang_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_coupang_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_coupang_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_full"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_coupang_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_with_coupang_status"
            referencedColumns: ["item_id"]
          },
        ]
      }
      item_erp_mapping: {
        Row: {
          confidence: string
          created_at: string
          erp_code: string | null
          erp_item_name: string | null
          erp_spec: string | null
          erp_system: string
          id: number
          item_id: number
          mapping_status: string
          notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          confidence: string
          created_at?: string
          erp_code?: string | null
          erp_item_name?: string | null
          erp_spec?: string | null
          erp_system: string
          id?: number
          item_id: number
          mapping_status?: string
          notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          confidence?: string
          created_at?: string
          erp_code?: string | null
          erp_item_name?: string | null
          erp_spec?: string | null
          erp_system?: string
          id?: number
          item_id?: number
          mapping_status?: string
          notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_erp_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_master"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_erp_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_sales"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_erp_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_erp_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_erp_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_full"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_erp_mapping_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_with_coupang_status"
            referencedColumns: ["item_id"]
          },
        ]
      }
      item_master: {
        Row: {
          base_cost: number | null
          base_date: string | null
          base_stock_qty: number
          category: string | null
          channel_variant: string | null
          created_at: string
          is_active: boolean
          item_id: number
          item_name_norm: string
          item_name_raw: string
          item_type: string | null
          manufacture_year: string | null
          notes: string | null
          seq_no: number
          unit_count: number | null
          unit_label: string | null
          updated_at: string
        }
        Insert: {
          base_cost?: number | null
          base_date?: string | null
          base_stock_qty?: number
          category?: string | null
          channel_variant?: string | null
          created_at?: string
          is_active?: boolean
          item_id?: number
          item_name_norm: string
          item_name_raw: string
          item_type?: string | null
          manufacture_year?: string | null
          notes?: string | null
          seq_no: number
          unit_count?: number | null
          unit_label?: string | null
          updated_at?: string
        }
        Update: {
          base_cost?: number | null
          base_date?: string | null
          base_stock_qty?: number
          category?: string | null
          channel_variant?: string | null
          created_at?: string
          is_active?: boolean
          item_id?: number
          item_name_norm?: string
          item_name_raw?: string
          item_type?: string | null
          manufacture_year?: string | null
          notes?: string | null
          seq_no?: number
          unit_count?: number | null
          unit_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      noncompliant_delivery: {
        Row: {
          barcode_error: number | null
          created_at: string | null
          damaged: number | null
          expiry_error: number | null
          id: number
          invalid_info: number | null
          over_delivery: number | null
          product_category: string
          statement_missing: number | null
          sub_category: string | null
          total_noncompliance: number | null
          under_delivery: number | null
          units_confirmed: number | null
          units_received: number | null
          units_requested: number | null
          vendor_id: string
          wrong_fc: number | null
          wrong_item: number | null
          wrong_packaging: number | null
          year_week: string
        }
        Insert: {
          barcode_error?: number | null
          created_at?: string | null
          damaged?: number | null
          expiry_error?: number | null
          id?: never
          invalid_info?: number | null
          over_delivery?: number | null
          product_category: string
          statement_missing?: number | null
          sub_category?: string | null
          total_noncompliance?: number | null
          under_delivery?: number | null
          units_confirmed?: number | null
          units_received?: number | null
          units_requested?: number | null
          vendor_id: string
          wrong_fc?: number | null
          wrong_item?: number | null
          wrong_packaging?: number | null
          year_week: string
        }
        Update: {
          barcode_error?: number | null
          created_at?: string | null
          damaged?: number | null
          expiry_error?: number | null
          id?: never
          invalid_info?: number | null
          over_delivery?: number | null
          product_category?: string
          statement_missing?: number | null
          sub_category?: string | null
          total_noncompliance?: number | null
          under_delivery?: number | null
          units_confirmed?: number | null
          units_received?: number | null
          units_requested?: number | null
          vendor_id?: string
          wrong_fc?: number | null
          wrong_item?: number | null
          wrong_packaging?: number | null
          year_week?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          counterparty: string | null
          crawled_at: string
          created_at: string
          erp_code: string | null
          erp_item_name_raw: string | null
          erp_system: string
          erp_tx_line_no: number | null
          erp_tx_no: string | null
          id: number
          is_internal: boolean
          item_id: number
          memo: string | null
          quantity: number
          supply_amount: number | null
          total_amount: number | null
          tx_date: string
          tx_type: string
          unit_price: number | null
          vat: number | null
        }
        Insert: {
          counterparty?: string | null
          crawled_at?: string
          created_at?: string
          erp_code?: string | null
          erp_item_name_raw?: string | null
          erp_system: string
          erp_tx_line_no?: number | null
          erp_tx_no?: string | null
          id?: number
          is_internal?: boolean
          item_id: number
          memo?: string | null
          quantity: number
          supply_amount?: number | null
          total_amount?: number | null
          tx_date: string
          tx_type: string
          unit_price?: number | null
          vat?: number | null
        }
        Update: {
          counterparty?: string | null
          crawled_at?: string
          created_at?: string
          erp_code?: string | null
          erp_item_name_raw?: string | null
          erp_system?: string
          erp_tx_line_no?: number | null
          erp_tx_no?: string | null
          id?: number
          is_internal?: boolean
          item_id?: number
          memo?: string | null
          quantity?: number
          supply_amount?: number | null
          total_amount?: number | null
          tx_date?: string
          tx_type?: string
          unit_price?: number | null
          vat?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_master"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_sales"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_full"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_with_coupang_status"
            referencedColumns: ["item_id"]
          },
        ]
      }
      regional_sales: {
        Row: {
          brand: string | null
          created_at: string | null
          detail_category: string | null
          gmv: number | null
          id: number
          product_category: string | null
          sido: string
          sigungu: string | null
          sub_category: string | null
          units_sold: number | null
          year_month: string
        }
        Insert: {
          brand?: string | null
          created_at?: string | null
          detail_category?: string | null
          gmv?: number | null
          id?: never
          product_category?: string | null
          sido: string
          sigungu?: string | null
          sub_category?: string | null
          units_sold?: number | null
          year_month: string
        }
        Update: {
          brand?: string | null
          created_at?: string | null
          detail_category?: string | null
          gmv?: number | null
          id?: never
          product_category?: string | null
          sido?: string
          sigungu?: string | null
          sub_category?: string | null
          units_sold?: number | null
          year_month?: string
        }
        Relationships: []
      }
      safety_stock_config: {
        Row: {
          calculation_method: string | null
          last_calculated_at: string | null
          lead_time_days: number | null
          notes: string | null
          reorder_point: number | null
          safety_stock_qty: number
          sku_id: string
          updated_at: string | null
        }
        Insert: {
          calculation_method?: string | null
          last_calculated_at?: string | null
          lead_time_days?: number | null
          notes?: string | null
          reorder_point?: number | null
          safety_stock_qty: number
          sku_id: string
          updated_at?: string | null
        }
        Update: {
          calculation_method?: string | null
          last_calculated_at?: string | null
          lead_time_days?: number | null
          notes?: string | null
          reorder_point?: number | null
          safety_stock_qty?: number
          sku_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_stock_config_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: true
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
        ]
      }
      sku_master: {
        Row: {
          barcode: string | null
          brand: string | null
          created_at: string | null
          detail_category: string | null
          is_rocket_fresh: boolean | null
          product_category: string | null
          product_id: string | null
          sku_id: string
          sku_name: string
          sub_category: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          created_at?: string | null
          detail_category?: string | null
          is_rocket_fresh?: boolean | null
          product_category?: string | null
          product_id?: string | null
          sku_id: string
          sku_name: string
          sub_category?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          created_at?: string | null
          detail_category?: string | null
          is_rocket_fresh?: boolean | null
          product_category?: string | null
          product_id?: string | null
          sku_id?: string
          sku_name?: string
          sub_category?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      stock_movement: {
        Row: {
          created_at: string
          erp_system: string | null
          id: number
          item_id: number
          memo: string | null
          movement_date: string
          movement_type: string
          quantity_delta: number
          running_stock: number | null
          source_id: number | null
          source_table: string
        }
        Insert: {
          created_at?: string
          erp_system?: string | null
          id?: number
          item_id: number
          memo?: string | null
          movement_date: string
          movement_type: string
          quantity_delta: number
          running_stock?: number | null
          source_id?: number | null
          source_table: string
        }
        Update: {
          created_at?: string
          erp_system?: string | null
          id?: number
          item_id?: number
          memo?: string | null
          movement_date?: string
          movement_type?: string
          quantity_delta?: number
          running_stock?: number | null
          source_id?: number | null
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_master"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_sales"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_full"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_with_coupang_status"
            referencedColumns: ["item_id"]
          },
        ]
      }
      weather_unified: {
        Row: {
          apparent_temp_avg: number | null
          apparent_temp_max: number | null
          apparent_temp_min: number | null
          created_at: string | null
          evapotranspiration: number | null
          forecast_day: number | null
          humidity_avg: number | null
          id: number
          issued_date: string | null
          lat: number | null
          lon: number | null
          precipitation: number | null
          radiation: number | null
          rain: number | null
          snowfall: number | null
          source: string
          station: string
          temp_avg: number | null
          temp_max: number | null
          temp_min: number | null
          weather_code: string | null
          weather_date: string
          wind_avg: number | null
          wind_direction: number | null
          wind_gust_max: number | null
          wind_max: number | null
        }
        Insert: {
          apparent_temp_avg?: number | null
          apparent_temp_max?: number | null
          apparent_temp_min?: number | null
          created_at?: string | null
          evapotranspiration?: number | null
          forecast_day?: number | null
          humidity_avg?: number | null
          id?: never
          issued_date?: string | null
          lat?: number | null
          lon?: number | null
          precipitation?: number | null
          radiation?: number | null
          rain?: number | null
          snowfall?: number | null
          source: string
          station: string
          temp_avg?: number | null
          temp_max?: number | null
          temp_min?: number | null
          weather_code?: string | null
          weather_date: string
          wind_avg?: number | null
          wind_direction?: number | null
          wind_gust_max?: number | null
          wind_max?: number | null
        }
        Update: {
          apparent_temp_avg?: number | null
          apparent_temp_max?: number | null
          apparent_temp_min?: number | null
          created_at?: string | null
          evapotranspiration?: number | null
          forecast_day?: number | null
          humidity_avg?: number | null
          id?: never
          issued_date?: string | null
          lat?: number | null
          lon?: number | null
          precipitation?: number | null
          radiation?: number | null
          rain?: number | null
          snowfall?: number | null
          source?: string
          station?: string
          temp_avg?: number | null
          temp_max?: number | null
          temp_min?: number | null
          weather_code?: string | null
          weather_date?: string
          wind_avg?: number | null
          wind_direction?: number | null
          wind_gust_max?: number | null
          wind_max?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_coupang_daily_sales: {
        Row: {
          boxes_returned: number | null
          boxes_sold: number | null
          category: string | null
          gmv: number | null
          item_id: number | null
          item_name_raw: string | null
          pieces_returned_gl_unit: number | null
          pieces_sold_gl_unit: number | null
          promo_gmv: number | null
          sale_date: string | null
          seq_no: number | null
          sku_count: number | null
          sku_ids: string | null
        }
        Relationships: []
      }
      v_coupang_daily_stock: {
        Row: {
          any_sku_stockout: boolean | null
          boxes_inbound: number | null
          boxes_outbound: number | null
          category: string | null
          item_id: number | null
          item_name_raw: string | null
          op_date: string | null
          seq_no: number | null
          sku_count: number | null
          sku_ids: string | null
          stockout_sku_count: number | null
          total_boxes_in_coupang_fc: number | null
          total_pieces_gl_unit: number | null
        }
        Relationships: []
      }
      v_current_stock: {
        Row: {
          base_cost: number | null
          base_date: string | null
          base_stock_qty: number | null
          category: string | null
          channel_variant: string | null
          current_stock: number | null
          is_active: boolean | null
          item_id: number | null
          item_name_norm: string | null
          item_name_raw: string | null
          item_type: string | null
          last_movement_date: string | null
          last_movement_type: string | null
          manufacture_year: string | null
          seq_no: number | null
          unit_count: number | null
          unit_label: string | null
        }
        Relationships: []
      }
      v_data_status: {
        Row: {
          earliest_date: string | null
          latest_date: string | null
          table_name: string | null
          total_rows: number | null
          unique_skus: number | null
        }
        Relationships: []
      }
      v_item_full: {
        Row: {
          base_date: string | null
          base_stock_qty: number | null
          category: string | null
          channel_variant: string | null
          coupang_mappings: Json | null
          current_stock: number | null
          gl_confidence: string | null
          gl_erp_code: string | null
          gl_pharm_confidence: string | null
          gl_pharm_erp_code: string | null
          gl_pharm_status: string | null
          gl_status: string | null
          hnb_confidence: string | null
          hnb_erp_code: string | null
          hnb_status: string | null
          is_active: boolean | null
          item_id: number | null
          item_name_norm: string | null
          item_name_raw: string | null
          item_type: string | null
          manufacture_year: string | null
          seq_no: number | null
        }
        Relationships: []
      }
      v_item_with_coupang_status: {
        Row: {
          base_date: string | null
          base_stock_qty: number | null
          boxes_sold_30d: number | null
          category: string | null
          coupang_fc_boxes: number | null
          coupang_fc_pieces_gl_unit: number | null
          coupang_last_updated: string | null
          coupang_sku_count: number | null
          gl_warehouse_stock: number | null
          gmv_30d: number | null
          has_coupang_mapping: boolean | null
          item_id: number | null
          item_name_raw: string | null
          item_type: string | null
          manufacture_year: string | null
          pieces_sold_30d_gl_unit: number | null
          seq_no: number | null
        }
        Relationships: []
      }
      v_promo_roi: {
        Row: {
          gmv: number | null
          promo_gmv: number | null
          promo_roi: number | null
          promo_units_sold: number | null
          sale_date: string | null
          sku_id: string | null
          total_discount: number | null
          units_sold: number | null
          vendor_item_id: string | null
        }
        Insert: {
          gmv?: number | null
          promo_gmv?: number | null
          promo_roi?: never
          promo_units_sold?: number | null
          sale_date?: string | null
          sku_id?: string | null
          total_discount?: never
          units_sold?: number | null
          vendor_item_id?: string | null
        }
        Update: {
          gmv?: number | null
          promo_gmv?: number | null
          promo_roi?: never
          promo_units_sold?: number | null
          sale_date?: string | null
          sku_id?: string | null
          total_discount?: never
          units_sold?: number | null
          vendor_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_performance_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
        ]
      }
      v_sales_weather: {
        Row: {
          brand: string | null
          cogs: number | null
          conversion_rate: number | null
          detail_category: string | null
          gmv: number | null
          humidity_avg: number | null
          page_views: number | null
          precipitation: number | null
          promo_gmv: number | null
          radiation: number | null
          return_units: number | null
          sale_date: string | null
          sku_id: string | null
          sku_name: string | null
          snowfall: number | null
          temp_avg: number | null
          temp_max: number | null
          temp_min: number | null
          total_discount: number | null
          units_sold: number | null
          vendor_item_id: string | null
          vendor_item_name: string | null
          wind_avg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_performance_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
        ]
      }
      v_stock_alert: {
        Row: {
          brand: string | null
          current_stock: number | null
          is_stockout: boolean | null
          lead_time_days: number | null
          op_date: string | null
          order_status: string | null
          reorder_point: number | null
          safety_stock_qty: number | null
          sku_id: string | null
          sku_name: string | null
          stock_gap: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_operation_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
        ]
      }
      v_stock_history: {
        Row: {
          category: string | null
          erp_system: string | null
          item_id: number | null
          item_name_raw: string | null
          memo: string | null
          movement_date: string | null
          movement_type: string | null
          quantity_delta: number | null
          running_stock: number | null
          seq_no: number | null
          source_id: number | null
          source_table: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_master"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_sales"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_coupang_daily_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_full"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movement_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_with_coupang_status"
            referencedColumns: ["item_id"]
          },
        ]
      }
      v_weather_forecast: {
        Row: {
          apparent_temp_avg: number | null
          apparent_temp_max: number | null
          apparent_temp_min: number | null
          forecast_day: number | null
          humidity_avg: number | null
          issued_date: string | null
          precipitation: number | null
          rain: number | null
          snowfall: number | null
          station: string | null
          temp_avg: number | null
          temp_max: number | null
          temp_min: number | null
          weather_code: string | null
          weather_date: string | null
          wind_avg: number | null
        }
        Insert: {
          apparent_temp_avg?: number | null
          apparent_temp_max?: number | null
          apparent_temp_min?: number | null
          forecast_day?: number | null
          humidity_avg?: number | null
          issued_date?: string | null
          precipitation?: number | null
          rain?: number | null
          snowfall?: number | null
          station?: string | null
          temp_avg?: number | null
          temp_max?: number | null
          temp_min?: number | null
          weather_code?: string | null
          weather_date?: string | null
          wind_avg?: number | null
        }
        Update: {
          apparent_temp_avg?: number | null
          apparent_temp_max?: number | null
          apparent_temp_min?: number | null
          forecast_day?: number | null
          humidity_avg?: number | null
          issued_date?: string | null
          precipitation?: number | null
          rain?: number | null
          snowfall?: number | null
          station?: string | null
          temp_avg?: number | null
          temp_max?: number | null
          temp_min?: number | null
          weather_code?: string | null
          weather_date?: string | null
          wind_avg?: number | null
        }
        Relationships: []
      }
      v_weather_observed: {
        Row: {
          humidity_avg: number | null
          precipitation: number | null
          radiation: number | null
          rain: number | null
          snowfall: number | null
          station: string | null
          temp_avg: number | null
          temp_max: number | null
          temp_min: number | null
          weather_date: string | null
          wind_avg: number | null
        }
        Insert: {
          humidity_avg?: number | null
          precipitation?: number | null
          radiation?: number | null
          rain?: number | null
          snowfall?: number | null
          station?: string | null
          temp_avg?: number | null
          temp_max?: number | null
          temp_min?: number | null
          weather_date?: string | null
          wind_avg?: number | null
        }
        Update: {
          humidity_avg?: number | null
          precipitation?: number | null
          radiation?: number | null
          rain?: number | null
          snowfall?: number | null
          station?: string | null
          temp_avg?: number | null
          temp_max?: number | null
          temp_min?: number | null
          weather_date?: string | null
          wind_avg?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
