export type Category = 'Food' | 'Drink' | 'Dessert';

export type OrderItemStatus = 'Pending' | 'Ready';

export interface AppUser {
  id: string;
  name: string;
  phone: string;
  passwordHash: string;
  address: string;
  isCloudSynced?: boolean;
  createdAt?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: Category;
  description?: string;
}

export interface OrderItem extends MenuItem {
  quantity: number;
  status: OrderItemStatus;
  remark?: string;
}

export type TableStatus = 'Available' | 'Occupied' | 'Billed';

export interface Table {
  id: number;
  number: string;
  status: TableStatus;
  currentOrder?: OrderItem[];
  orderStartTime?: Date;
}

export interface RestaurantData {
  name: string;
  address: string;
  phone: string;
}

export interface Transaction {
  id: string;
  tableNumber: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  timestamp: Date;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  timestamp: Date;
}
