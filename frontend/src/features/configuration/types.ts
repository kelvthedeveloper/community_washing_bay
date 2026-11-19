export type ConfigurationSectionId =
  | "vehicle-types"
  | "services"
  | "service-pricing"
  | "commission-settings"
  | "expense-categories"
  | "inventory-categories";

export interface TimestampedRecord {
  id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NamedConfigurationRecord extends TimestampedRecord {
  name: string;
  description: string;
}

export interface ServicePricingRecord extends TimestampedRecord {
  vehicle_type: string;
  vehicle_type_name: string;
  service: string;
  service_name: string;
  price: string;
  effective_date: string;
}

export interface CommissionSettingRecord extends TimestampedRecord {
  commission_percentage: string;
  effective_date: string;
}

export type ConfigurationRecord =
  | NamedConfigurationRecord
  | ServicePricingRecord
  | CommissionSettingRecord;

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type ConfigurationWritePayload =
  | {
      name: string;
      description: string;
      is_active: boolean;
    }
  | {
      vehicle_type: string;
      service: string;
      price: string;
      effective_date: string;
      is_active: boolean;
    }
  | {
      commission_percentage: string;
      effective_date: string;
      is_active: boolean;
    }
  | {
      is_active: boolean;
    };
