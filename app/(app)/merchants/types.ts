export interface MerchantListItem {
  id: string;
  canonical_name: string;
  display_name: string;
  default_category_id: string | null;
  category_name: string | null;
  icon: string | null;
  color: string | null;
  transaction_count: number;
}
