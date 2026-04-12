// supabase/types.ts
// 자동 생성 예정: npx supabase gen types typescript --project-id sbyglmzogaiwbwfjhrmo
// 현재는 수동 작성 (20단계 스키마 기반)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          seq: number;
          category: string;
          product_type: string;
          production: string;
          manufacture_year: string | null;
          name: string;
          unit: string;
          unit_cost: number | null;
          erp_code: string | null;
          erp_name: string | null;
          coupang_sku_id: string | null;
          coupang_name: string | null;
          mapping_accuracy: string | null;
          mapping_status: string | null;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seq: number;
          category: string;
          product_type: string;
          production: string;
          manufacture_year?: string | null;
          name: string;
          unit?: string;
          unit_cost?: number | null;
          erp_code?: string | null;
          erp_name?: string | null;
          coupang_sku_id?: string | null;
          coupang_name?: string | null;
          mapping_accuracy?: string | null;
          mapping_status?: string | null;
          is_active?: boolean;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
      };
      inventory: {
        Row: {
          id: string;
          product_id: string;
          current_stock: number;
          carryover_stock: number;
          unit_cost: number | null;
          inventory_value: number | null;
          safety_stock: number;
          last_checked: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          current_stock?: number;
          carryover_stock?: number;
          unit_cost?: number | null;
          inventory_value?: number | null;
          safety_stock?: number;
          last_checked?: string | null;
          status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inventory"]["Insert"]>;
      };
      stock_movements: {
        Row: {
          id: string;
          product_id: string;
          date: string;
          movement_type: string;
          quantity: number;
          unit_cost: number | null;
          amount: number | null;
          erp_date: string | null;
          erp_ref: string | null;
          source: string;
          confirmed: boolean;
          confirmed_by: string | null;
          confirmed_at: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          date: string;
          movement_type: string;
          quantity: number;
          unit_cost?: number | null;
          amount?: number | null;
          erp_date?: string | null;
          erp_ref?: string | null;
          source?: string;
          confirmed?: boolean;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["stock_movements"]["Insert"]>;
      };
      sku_mappings: {
        Row: {
          id: string;
          product_id: string;
          coupang_sku_id: string;
          coupang_sku_name: string | null;
          accuracy: string | null;
          basis: string | null;
          relation: string | null;
          erp_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          coupang_sku_id: string;
          coupang_sku_name?: string | null;
          accuracy?: string | null;
          basis?: string | null;
          relation?: string | null;
          erp_code?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sku_mappings"]["Insert"]>;
      };
      coupang_performance: {
        Row: {
          id: string;
          date: string;
          product_id_cp: number | null;
          barcode: string | null;
          coupang_sku_id: number;
          sku_name: string | null;
          vendor_item_id: number | null;
          vendor_item_name: string | null;
          category_l1: string | null;
          category_l2: string | null;
          category_l3: string | null;
          brand: string | null;
          gmv: number;
          units_sold: number;
          return_units: number;
          cogs: number;
          amv: number;
          coupon_discount: number;
          instant_discount: number;
          promo_gmv: number;
          promo_units: number;
          asp: number;
          order_count: number;
          customer_count: number;
          avg_order_value: number;
          conversion_rate: number;
          page_views: number;
          review_count: number;
          avg_rating: number;
          source: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["coupang_performance"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["coupang_performance"]["Insert"]>;
      };
      coupang_logistics: {
        Row: {
          id: string;
          date: string;
          coupang_sku_id: number;
          sku_name: string | null;
          barcode: string | null;
          category_l1: string | null;
          category_l2: string | null;
          category_l3: string | null;
          brand: string | null;
          center: string | null;
          order_status: string | null;
          order_status_detail: string | null;
          inbound_qty: number;
          outbound_qty: number;
          current_stock: number;
          purchase_cost: number;
          is_stockout: boolean;
          subcategory_stockout_rate: number;
          source: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["coupang_logistics"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["coupang_logistics"]["Insert"]>;
      };
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          role: string;
          department: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name: string;
          role?: string;
          department?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      alerts: {
        Row: {
          id: string;
          alert_type: string;
          severity: string;
          title: string;
          message: string | null;
          product_id: string | null;
          related_data: Json | null;
          rag_query: string | null;
          rag_response: string | null;
          rag_sources: Json | null;
          status: string;
          actioned_by: string | null;
          actioned_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          alert_type: string;
          title: string;
          severity?: string;
          message?: string | null;
          product_id?: string | null;
          status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["alerts"]["Insert"]>;
      };
      forecasts: {
        Row: {
          id: string;
          product_id: string;
          forecast_date: string;
          predicted_qty: number | null;
          model_name: string | null;
          confidence_lower: number | null;
          confidence_upper: number | null;
          confidence_level: number | null;
          input_features: Json | null;
          model_version: string | null;
          training_period: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          forecast_date: string;
          predicted_qty?: number | null;
          model_name?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["forecasts"]["Insert"]>;
      };
    };
    Views: {
      v_inventory_dashboard: {
        Row: {
          product_id: string;
          seq: number;
          category: string;
          product_name: string;
          product_type: string;
          production: string;
          unit: string;
          current_stock: number | null;
          carryover_stock: number | null;
          unit_cost: number | null;
          inventory_value: number | null;
          safety_stock: number | null;
          status: string | null;
          coupang_sku_id: string | null;
          coupang_name: string | null;
          erp_code: string | null;
          mapping_status: string | null;
          updated_at: string | null;
        };
      };
      v_coupang_daily_summary: {
        Row: {
          date: string;
          total_gmv: number;
          total_amv: number;
          total_units: number;
          total_returns: number;
          total_promo_gmv: number;
          avg_conversion: number;
          total_pv: number;
          active_skus: number;
        };
      };
      v_low_stock_alerts: {
        Row: {
          product_id: string;
          seq: number;
          product_name: string;
          category: string;
          current_stock: number;
          safety_stock: number;
          stock_gap: number;
          status: string;
        };
      };
    };
    Functions: {
      process_stock_movement: {
        Args: {
          p_product_id: string;
          p_movement_type: string;
          p_quantity: number;
          p_unit_cost?: number;
          p_notes?: string;
        };
        Returns: string;
      };
      search_documents: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
        };
        Returns: {
          chunk_id: string;
          document_id: string;
          content: string;
          similarity: number;
        }[];
      };
    };
  };
}
