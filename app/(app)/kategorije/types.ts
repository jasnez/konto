export interface CategoryListItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  kind: string;
  is_system: boolean;
  parent_id: string | null;
  sort_order: number;
}
