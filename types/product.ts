export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  stock: number;
  attributes: Record<string, string>;
  use_cases: string[];
  tags: string[];
  active: boolean;
  created_at: string;
}