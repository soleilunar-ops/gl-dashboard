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
      allocation_items: {
        Row: {
          allocation_id: number
          basic_price: number
          center_name: string
          id: number
          line_cost: number
          pallet_count: number
        }
        Insert: {
          allocation_id: number
          basic_price: number
          center_name: string
          id?: number
          line_cost: number
          pallet_count: number
        }
        Update: {
          allocation_id?: number
          basic_price?: number
          center_name?: string
          id?: number
          line_cost?: number
          pallet_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "allocation_items_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      allocations: {
        Row: {
          center_count: number
          created_at: string
          id: number
          memo: string | null
          order_date: string
          total_cost: number
          total_pallets: number
          updated_at: string
        }
        Insert: {
          center_count: number
          created_at?: string
          id?: number
          memo?: string | null
          order_date: string
          total_cost: number
          total_pallets: number
          updated_at?: string
        }
        Update: {
          center_count?: number
          created_at?: string
          id?: number
          memo?: string | null
          order_date?: string
          total_cost?: number
          total_pallets?: number
          updated_at?: string
        }
        Relationships: []
      }
      baseline_kpi_snapshot: {
        Row: {
          avg_margin_rate: number | null
          avg_roi: number | null
          best_roi_month: string | null
          calculated_at: string | null
          cost_ratio: number | null
          season: string
          total_cost: number | null
          total_gmv: number | null
        }
        Insert: {
          avg_margin_rate?: number | null
          avg_roi?: number | null
          best_roi_month?: string | null
          calculated_at?: string | null
          cost_ratio?: number | null
          season: string
          total_cost?: number | null
          total_gmv?: number | null
        }
        Update: {
          avg_margin_rate?: number | null
          avg_roi?: number | null
          best_roi_month?: string | null
          calculated_at?: string | null
          cost_ratio?: number | null
          season?: string
          total_cost?: number | null
          total_gmv?: number | null
        }
        Relationships: []
      }
      bi_box_daily: {
        Row: {
          attribute_error: boolean | null
          bi_box_share: number | null
          created_at: string | null
          date: string
          is_stockout: boolean | null
          max_price: number | null
          mid_price: number | null
          min_price: number | null
          per_piece_price_ok: boolean | null
          sku_id: string
          sku_name: string | null
          source_file: string | null
          unit_price_ok: boolean | null
          vendor_item_id: string
          vendor_item_name: string | null
        }
        Insert: {
          attribute_error?: boolean | null
          bi_box_share?: number | null
          created_at?: string | null
          date: string
          is_stockout?: boolean | null
          max_price?: number | null
          mid_price?: number | null
          min_price?: number | null
          per_piece_price_ok?: boolean | null
          sku_id: string
          sku_name?: string | null
          source_file?: string | null
          unit_price_ok?: boolean | null
          vendor_item_id: string
          vendor_item_name?: string | null
        }
        Update: {
          attribute_error?: boolean | null
          bi_box_share?: number | null
          created_at?: string | null
          date?: string
          is_stockout?: boolean | null
          max_price?: number | null
          mid_price?: number | null
          min_price?: number | null
          per_piece_price_ok?: boolean | null
          sku_id?: string
          sku_name?: string | null
          source_file?: string | null
          unit_price_ok?: boolean | null
          vendor_item_id?: string
          vendor_item_name?: string | null
        }
        Relationships: []
      }
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
      coupang_daily_performance: {
        Row: {
          asp: number | null
          brand: string | null
          cogs: number | null
          conversion_rate: number | null
          coupon_discount: number | null
          created_at: string | null
          date: string
          gmv: number | null
          instant_discount: number | null
          is_baseline: boolean | null
          order_count: number | null
          page_views: number | null
          promo_gmv: number | null
          promo_units_sold: number | null
          return_units: number | null
          season: string | null
          sku_id: string
          sku_name: string | null
          units_sold: number | null
          updated_at: string | null
          vendor_item_id: string | null
        }
        Insert: {
          asp?: number | null
          brand?: string | null
          cogs?: number | null
          conversion_rate?: number | null
          coupon_discount?: number | null
          created_at?: string | null
          date: string
          gmv?: number | null
          instant_discount?: number | null
          is_baseline?: boolean | null
          order_count?: number | null
          page_views?: number | null
          promo_gmv?: number | null
          promo_units_sold?: number | null
          return_units?: number | null
          season?: string | null
          sku_id: string
          sku_name?: string | null
          units_sold?: number | null
          updated_at?: string | null
          vendor_item_id?: string | null
        }
        Update: {
          asp?: number | null
          brand?: string | null
          cogs?: number | null
          conversion_rate?: number | null
          coupon_discount?: number | null
          created_at?: string | null
          date?: string
          gmv?: number | null
          instant_discount?: number | null
          is_baseline?: boolean | null
          order_count?: number | null
          page_views?: number | null
          promo_gmv?: number | null
          promo_units_sold?: number | null
          return_units?: number | null
          season?: string | null
          sku_id?: string
          sku_name?: string | null
          units_sold?: number | null
          updated_at?: string | null
          vendor_item_id?: string | null
        }
        Relationships: []
      }
      coupang_delivery_detail: {
        Row: {
          created_at: string | null
          delivery_date: string
          id: number
          invoice_no: string | null
          is_baseline: boolean | null
          logistics_center: string | null
          payment_date: string | null
          quantity: number | null
          season: string | null
          sku_id: string | null
          sku_name: string | null
          supply_amount: number | null
          tax_amount: number | null
          total_supply_amount: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          delivery_date: string
          id?: number
          invoice_no?: string | null
          is_baseline?: boolean | null
          logistics_center?: string | null
          payment_date?: string | null
          quantity?: number | null
          season?: string | null
          sku_id?: string | null
          sku_name?: string | null
          supply_amount?: number | null
          tax_amount?: number | null
          total_supply_amount?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          delivery_date?: string
          id?: number
          invoice_no?: string | null
          is_baseline?: boolean | null
          logistics_center?: string | null
          payment_date?: string | null
          quantity?: number | null
          season?: string | null
          sku_id?: string | null
          sku_name?: string | null
          supply_amount?: number | null
          tax_amount?: number | null
          total_supply_amount?: number | null
          unit_price?: number | null
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
      ecount_production_outsource: {
        Row: {
          company_code: string
          counterparty: string | null
          crawled_at: string | null
          date_from: string | null
          date_to: string | null
          doc_date: string | null
          doc_no: string | null
          erp_code: string | null
          id: number
          memo: string | null
          product_name: string | null
          qty: number | null
          spec: string | null
          supply_amount: number | null
          total_amount: number | null
          unit_price: number | null
          unit_price_vat: number | null
          vat_amount: number | null
        }
        Insert: {
          company_code: string
          counterparty?: string | null
          crawled_at?: string | null
          date_from?: string | null
          date_to?: string | null
          doc_date?: string | null
          doc_no?: string | null
          erp_code?: string | null
          id?: never
          memo?: string | null
          product_name?: string | null
          qty?: number | null
          spec?: string | null
          supply_amount?: number | null
          total_amount?: number | null
          unit_price?: number | null
          unit_price_vat?: number | null
          vat_amount?: number | null
        }
        Update: {
          company_code?: string
          counterparty?: string | null
          crawled_at?: string | null
          date_from?: string | null
          date_to?: string | null
          doc_date?: string | null
          doc_no?: string | null
          erp_code?: string | null
          id?: never
          memo?: string | null
          product_name?: string | null
          qty?: number | null
          spec?: string | null
          supply_amount?: number | null
          total_amount?: number | null
          unit_price?: number | null
          unit_price_vat?: number | null
          vat_amount?: number | null
        }
        Relationships: []
      }
      ecount_production_receipt: {
        Row: {
          company_code: string
          crawled_at: string | null
          date_from: string
          date_to: string
          factory_name: string | null
          id: number
          product_name: string | null
          qty: number | null
          receipt_no: string | null
          warehouse_name: string | null
          work_order: string | null
        }
        Insert: {
          company_code: string
          crawled_at?: string | null
          date_from: string
          date_to: string
          factory_name?: string | null
          id?: never
          product_name?: string | null
          qty?: number | null
          receipt_no?: string | null
          warehouse_name?: string | null
          work_order?: string | null
        }
        Update: {
          company_code?: string
          crawled_at?: string | null
          date_from?: string
          date_to?: string
          factory_name?: string | null
          id?: never
          product_name?: string | null
          qty?: number | null
          receipt_no?: string | null
          warehouse_name?: string | null
          work_order?: string | null
        }
        Relationships: []
      }
      ecount_purchase: {
        Row: {
          company_code: string
          counterparty: string | null
          crawled_at: string
          date_from: string | null
          date_to: string | null
          doc_date: string
          doc_no: string | null
          erp_code: string
          id: number
          memo: string | null
          product_name: string | null
          qty: number | null
          spec: string | null
          supply_amount: number | null
          total_amount: number | null
          unit_price: number | null
          unit_price_vat: number | null
          vat_amount: number | null
        }
        Insert: {
          company_code: string
          counterparty?: string | null
          crawled_at?: string
          date_from?: string | null
          date_to?: string | null
          doc_date: string
          doc_no?: string | null
          erp_code: string
          id?: number
          memo?: string | null
          product_name?: string | null
          qty?: number | null
          spec?: string | null
          supply_amount?: number | null
          total_amount?: number | null
          unit_price?: number | null
          unit_price_vat?: number | null
          vat_amount?: number | null
        }
        Update: {
          company_code?: string
          counterparty?: string | null
          crawled_at?: string
          date_from?: string | null
          date_to?: string | null
          doc_date?: string
          doc_no?: string | null
          erp_code?: string
          id?: number
          memo?: string | null
          product_name?: string | null
          qty?: number | null
          spec?: string | null
          supply_amount?: number | null
          total_amount?: number | null
          unit_price?: number | null
          unit_price_vat?: number | null
          vat_amount?: number | null
        }
        Relationships: []
      }
      ecount_sales: {
        Row: {
          company_code: string
          counterparty: string | null
          crawled_at: string
          date_from: string | null
          date_to: string | null
          doc_date: string
          doc_no: string | null
          erp_code: string
          id: number
          memo: string | null
          product_name: string | null
          qty: number | null
          spec: string | null
          supply_amount: number | null
          total_amount: number | null
          unit_price: number | null
          unit_price_vat: number | null
          vat_amount: number | null
        }
        Insert: {
          company_code: string
          counterparty?: string | null
          crawled_at?: string
          date_from?: string | null
          date_to?: string | null
          doc_date: string
          doc_no?: string | null
          erp_code: string
          id?: number
          memo?: string | null
          product_name?: string | null
          qty?: number | null
          spec?: string | null
          supply_amount?: number | null
          total_amount?: number | null
          unit_price?: number | null
          unit_price_vat?: number | null
          vat_amount?: number | null
        }
        Update: {
          company_code?: string
          counterparty?: string | null
          crawled_at?: string
          date_from?: string | null
          date_to?: string | null
          doc_date?: string
          doc_no?: string | null
          erp_code?: string
          id?: number
          memo?: string | null
          product_name?: string | null
          qty?: number | null
          spec?: string | null
          supply_amount?: number | null
          total_amount?: number | null
          unit_price?: number | null
          unit_price_vat?: number | null
          vat_amount?: number | null
        }
        Relationships: []
      }
      ecount_stock_ledger: {
        Row: {
          company_code: string
          counterparty: string | null
          crawled_at: string
          date_from: string | null
          date_to: string | null
          doc_date: string
          id: number
          inbound_qty: number | null
          memo: string | null
          outbound_qty: number | null
        }
        Insert: {
          company_code?: string
          counterparty?: string | null
          crawled_at?: string
          date_from?: string | null
          date_to?: string | null
          doc_date: string
          id?: number
          inbound_qty?: number | null
          memo?: string | null
          outbound_qty?: number | null
        }
        Update: {
          company_code?: string
          counterparty?: string | null
          crawled_at?: string
          date_from?: string | null
          date_to?: string | null
          doc_date?: string
          id?: number
          inbound_qty?: number | null
          memo?: string | null
          outbound_qty?: number | null
        }
        Relationships: []
      }
      forecast_model_a: {
        Row: {
          confidence_interval: number | null
          features_used: Json | null
          generated_at: string | null
          lower_bound: number | null
          model_version: string
          sku_id: string
          upper_bound: number | null
          used_synthetic: boolean | null
          week_start: string
          weekly_sales_qty_forecast: number
        }
        Insert: {
          confidence_interval?: number | null
          features_used?: Json | null
          generated_at?: string | null
          lower_bound?: number | null
          model_version?: string
          sku_id: string
          upper_bound?: number | null
          used_synthetic?: boolean | null
          week_start: string
          weekly_sales_qty_forecast: number
        }
        Update: {
          confidence_interval?: number | null
          features_used?: Json | null
          generated_at?: string | null
          lower_bound?: number | null
          model_version?: string
          sku_id?: string
          upper_bound?: number | null
          used_synthetic?: boolean | null
          week_start?: string
          weekly_sales_qty_forecast?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_model_a_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
        ]
      }
      forecast_model_b: {
        Row: {
          distribute_weeks: number | null
          distributed_qty: number | null
          generated_at: string | null
          id: number
          lookback_weeks: number | null
          model_version: string
          pred_linear: number | null
          pred_ratio: number | null
          product_category: string
          sku_id: string | null
          used_synthetic: boolean | null
          week_start: string
        }
        Insert: {
          distribute_weeks?: number | null
          distributed_qty?: number | null
          generated_at?: string | null
          id?: number
          lookback_weeks?: number | null
          model_version?: string
          pred_linear?: number | null
          pred_ratio?: number | null
          product_category: string
          sku_id?: string | null
          used_synthetic?: boolean | null
          week_start: string
        }
        Update: {
          distribute_weeks?: number | null
          distributed_qty?: number | null
          generated_at?: string | null
          id?: number
          lookback_weeks?: number | null
          model_version?: string
          pred_linear?: number | null
          pred_ratio?: number | null
          product_category?: string
          sku_id?: string | null
          used_synthetic?: boolean | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_model_b_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
        ]
      }
      import_leadtime: {
        Row: {
          bl_number: string | null
          created_at: string
          current_step: number
          customs_days: number
          erp_code: string | null
          id: string
          is_approved: boolean
          po_number: string
          product_name: string
          sea_days: number
          step1_actual: string | null
          step1_expected: string | null
          step2_actual: string | null
          step3_actual: string | null
          step3_expected: string | null
          step4_actual: string | null
          step4_expected: string | null
          step5_actual: string | null
          step5_expected: string | null
          tracking_status: string | null
          updated_at: string
          vessel_name: string | null
        }
        Insert: {
          bl_number?: string | null
          created_at?: string
          current_step?: number
          customs_days?: number
          erp_code?: string | null
          id?: string
          is_approved?: boolean
          po_number: string
          product_name: string
          sea_days?: number
          step1_actual?: string | null
          step1_expected?: string | null
          step2_actual?: string | null
          step3_actual?: string | null
          step3_expected?: string | null
          step4_actual?: string | null
          step4_expected?: string | null
          step5_actual?: string | null
          step5_expected?: string | null
          tracking_status?: string | null
          updated_at?: string
          vessel_name?: string | null
        }
        Update: {
          bl_number?: string | null
          created_at?: string
          current_step?: number
          customs_days?: number
          erp_code?: string | null
          id?: string
          is_approved?: boolean
          po_number?: string
          product_name?: string
          sea_days?: number
          step1_actual?: string | null
          step1_expected?: string | null
          step2_actual?: string | null
          step3_actual?: string | null
          step3_expected?: string | null
          step4_actual?: string | null
          step4_expected?: string | null
          step5_actual?: string | null
          step5_expected?: string | null
          tracking_status?: string | null
          updated_at?: string
          vessel_name?: string | null
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
      internal_entities: {
        Row: {
          created_at: string
          entity_id: number
          erp_system: string
          is_active: boolean
          match_type: string
          note: string | null
          pattern: string
        }
        Insert: {
          created_at?: string
          entity_id?: number
          erp_system: string
          is_active?: boolean
          match_type: string
          note?: string | null
          pattern: string
        }
        Update: {
          created_at?: string
          entity_id?: number
          erp_system?: string
          is_active?: boolean
          match_type?: string
          note?: string | null
          pattern?: string
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
      order_excel_upload_logs: {
        Row: {
          company_code: string
          created_at: string
          file_name: string
          id: string
          inserted_count: number
          skipped_count: number
          storage_path: string | null
          total_input: number
          uploaded_by: string | null
        }
        Insert: {
          company_code: string
          created_at?: string
          file_name: string
          id?: string
          inserted_count?: number
          skipped_count?: number
          storage_path?: string | null
          total_input?: number
          uploaded_by?: string | null
        }
        Update: {
          company_code?: string
          created_at?: string
          file_name?: string
          id?: string
          inserted_count?: number
          skipped_count?: number
          storage_path?: string | null
          total_input?: number
          uploaded_by?: string | null
        }
        Relationships: []
      }
      order_documents: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          id: string
          order_id: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          id?: string
          order_id: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          id?: string
          order_id?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
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
          rejected_reason: string | null
          status: string
          supply_amount: number | null
          total_amount: number | null
          tx_date: string
          tx_type: string
          unit_price: number | null
          vat: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
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
          rejected_reason?: string | null
          status?: string
          supply_amount?: number | null
          total_amount?: number | null
          tx_date: string
          tx_type: string
          unit_price?: number | null
          vat?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
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
          rejected_reason?: string | null
          status?: string
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
      promotion_ad_costs: {
        Row: {
          budget: number | null
          contract_no: number | null
          created_at: string | null
          end_date: string | null
          id: number
          is_baseline: boolean | null
          paid_amount: number | null
          season: string | null
          start_date: string | null
          year_month: string
        }
        Insert: {
          budget?: number | null
          contract_no?: number | null
          created_at?: string | null
          end_date?: string | null
          id?: number
          is_baseline?: boolean | null
          paid_amount?: number | null
          season?: string | null
          start_date?: string | null
          year_month: string
        }
        Update: {
          budget?: number | null
          contract_no?: number | null
          created_at?: string | null
          end_date?: string | null
          id?: number
          is_baseline?: boolean | null
          paid_amount?: number | null
          season?: string | null
          start_date?: string | null
          year_month?: string
        }
        Relationships: []
      }
      promotion_coupon_contracts: {
        Row: {
          budget: number | null
          contract_no: number
          coupon_category: string | null
          coupon_name: string | null
          created_at: string | null
          end_date: string | null
          is_baseline: boolean | null
          paid_amount: number | null
          season: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          budget?: number | null
          contract_no: number
          coupon_category?: string | null
          coupon_name?: string | null
          created_at?: string | null
          end_date?: string | null
          is_baseline?: boolean | null
          paid_amount?: number | null
          season?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          budget?: number | null
          contract_no?: number
          coupon_category?: string | null
          coupon_name?: string | null
          created_at?: string | null
          end_date?: string | null
          is_baseline?: boolean | null
          paid_amount?: number | null
          season?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promotion_milkrun_costs: {
        Row: {
          amount: number | null
          created_at: string | null
          delivery_date: string | null
          description: string | null
          id: number
          is_baseline: boolean | null
          season: string | null
          year_month: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          id?: number
          is_baseline?: boolean | null
          season?: string | null
          year_month: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          id?: number
          is_baseline?: boolean | null
          season?: string | null
          year_month?: string
        }
        Relationships: []
      }
      promotion_premium_data_costs: {
        Row: {
          amount: number | null
          created_at: string | null
          id: number
          is_baseline: boolean | null
          season: string | null
          year_month: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: number
          is_baseline?: boolean | null
          season?: string | null
          year_month: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: number
          is_baseline?: boolean | null
          season?: string | null
          year_month?: string
        }
        Relationships: []
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
      season_config: {
        Row: {
          end_date: string
          is_closed: boolean | null
          season: string
          start_date: string
        }
        Insert: {
          end_date: string
          is_closed?: boolean | null
          season: string
          start_date: string
        }
        Update: {
          end_date?: string
          is_closed?: boolean | null
          season?: string
          start_date?: string
        }
        Relationships: []
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
          real_quantity: number | null
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
          real_quantity?: number | null
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
          real_quantity?: number | null
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
      upload_history: {
        Row: {
          file_name: string | null
          file_type: string | null
          id: number
          period_end: string | null
          period_start: string | null
          row_count: number | null
          status: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          file_name?: string | null
          file_type?: string | null
          id?: number
          period_end?: string | null
          period_start?: string | null
          row_count?: number | null
          status?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string | null
          file_type?: string | null
          id?: number
          period_end?: string | null
          period_start?: string | null
          row_count?: number | null
          status?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      weather_daily: {
        Row: {
          avg_temp: number | null
          created_at: string | null
          date: string
          max_temp: number | null
          min_temp: number | null
          normal_avg_temp: number | null
          source: string | null
          temp_anomaly: number | null
          temp_diff: number | null
        }
        Insert: {
          avg_temp?: number | null
          created_at?: string | null
          date: string
          max_temp?: number | null
          min_temp?: number | null
          normal_avg_temp?: number | null
          source?: string | null
          temp_anomaly?: number | null
          temp_diff?: number | null
        }
        Update: {
          avg_temp?: number | null
          created_at?: string | null
          date?: string
          max_temp?: number | null
          min_temp?: number | null
          normal_avg_temp?: number | null
          source?: string | null
          temp_anomaly?: number | null
          temp_diff?: number | null
        }
        Relationships: []
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
      winter_validation: {
        Row: {
          abs_error: number | null
          actual: number | null
          bias: number | null
          error_pct: number | null
          generated_at: string | null
          grain: string
          id: number
          notes: string | null
          overall_mae: number | null
          predicted: number | null
          run_id: string
          sku_id: string | null
          used_synthetic: boolean | null
          val_mae_no_synthetic: number | null
          week_start: string | null
          winter_mae: number | null
        }
        Insert: {
          abs_error?: number | null
          actual?: number | null
          bias?: number | null
          error_pct?: number | null
          generated_at?: string | null
          grain: string
          id?: number
          notes?: string | null
          overall_mae?: number | null
          predicted?: number | null
          run_id: string
          sku_id?: string | null
          used_synthetic?: boolean | null
          val_mae_no_synthetic?: number | null
          week_start?: string | null
          winter_mae?: number | null
        }
        Update: {
          abs_error?: number | null
          actual?: number | null
          bias?: number | null
          error_pct?: number | null
          generated_at?: string | null
          grain?: string
          id?: number
          notes?: string | null
          overall_mae?: number | null
          predicted?: number | null
          run_id?: string
          sku_id?: string | null
          used_synthetic?: boolean | null
          val_mae_no_synthetic?: number | null
          week_start?: string | null
          winter_mae?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "winter_validation_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["sku_id"]
          },
        ]
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
      v_orders_approved: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          counterparty: string | null
          erp_system: string | null
          is_internal: boolean | null
          item_id: number | null
          item_name: string | null
          order_id: number | null
          quantity: number | null
          quantity_delta: number | null
          running_stock: number | null
          stock_movement_id: number | null
          total_amount: number | null
          tx_date: string | null
          tx_type: string | null
          tx_type_label: string | null
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
      v_orders_dashboard: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category: string | null
          counterparty: string | null
          crawled_at: string | null
          created_at: string | null
          erp_code: string | null
          erp_item_name_raw: string | null
          erp_system: string | null
          erp_tx_no: string | null
          is_internal: boolean | null
          is_return: boolean | null
          item_id: number | null
          item_name: string | null
          item_name_raw: string | null
          item_type: string | null
          memo: string | null
          order_id: number | null
          quantity: number | null
          quantity_delta: number | null
          rejected_reason: string | null
          seq_no: number | null
          status: string | null
          status_label: string | null
          stock_after_this_tx: number | null
          stock_direction: string | null
          stock_movement_id: number | null
          supply_amount: number | null
          total_amount: number | null
          tx_category: string | null
          tx_category_label: string | null
          tx_date: string | null
          tx_type: string | null
          tx_type_label: string | null
          unit_price: number | null
          vat: number | null
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
      v_orders_pending: {
        Row: {
          category: string | null
          counterparty: string | null
          crawled_at: string | null
          created_at: string | null
          erp_item_name_raw: string | null
          erp_system: string | null
          erp_tx_no: string | null
          is_internal: boolean | null
          item_id: number | null
          item_name: string | null
          memo: string | null
          order_id: number | null
          quantity: number | null
          stock_direction: string | null
          supply_amount: number | null
          total_amount: number | null
          tx_date: string | null
          tx_type: string | null
          tx_type_label: string | null
          unit_price: number | null
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
      v_orders_summary: {
        Row: {
          approved_count: number | null
          approved_today: number | null
          pending_count: number | null
          pending_purchase: number | null
          pending_return: number | null
          pending_sale: number | null
          rejected_count: number | null
          today_purchase: number | null
          today_sale: number | null
          total_count: number | null
          week_purchase: number | null
          week_purchase_amount: number | null
          week_sale: number | null
          week_sale_amount: number | null
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
          created_at: string | null
          erp_system: string | null
          item_id: number | null
          item_name_norm: string | null
          item_name_raw: string | null
          memo: string | null
          movement_date: string | null
          movement_type: string | null
          movement_type_label: string | null
          quantity_delta: number | null
          running_stock: number | null
          seq_no: number | null
          source_id: number | null
          source_table: string | null
          stock_direction: string | null
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
      v_weather_hybrid: {
        Row: {
          apparent_temp_avg: number | null
          apparent_temp_max: number | null
          apparent_temp_min: number | null
          humidity_avg: number | null
          lat: number | null
          lon: number | null
          precipitation: number | null
          rain: number | null
          snowfall: number | null
          station: string | null
          temp_avg: number | null
          temp_max: number | null
          temp_min: number | null
          weather_date: string | null
          wind_avg: number | null
          wind_direction: number | null
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
      gl_warehouse_daily_series: {
        Args: { p_from: string; p_to: string }
        Returns: {
          d: string
          inbound_qty: number
          outbound_qty: number
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
