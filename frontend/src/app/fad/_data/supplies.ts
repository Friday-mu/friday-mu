// @demo:data — Starter supply catalog + loadout rules — future GET /api/inventory/supplies
// Tag: PROD-DATA-50 — see frontend/DEMO_CRUFT.md

import type { Task, TaskSupplyCategory } from './tasks';
import { PROPERTY_BY_CODE } from './properties';

export interface SupplyCatalogItem {
  id: string;
  name: string;
  category: TaskSupplyCategory;
  unit: string;
  defaultUnitCost: number;
  currency: 'MUR' | 'EUR';
  defaultLocationCode: string;
}

export interface StockLocationOption {
  code: string;
  label: string;
}

export interface SupplyLoadoutItem extends SupplyCatalogItem {
  quantity: number;
  reason: string;
}

export const STOCK_LOCATION_OPTIONS: StockLocationOption[] = [
  { code: 'main_store', label: 'Main store' },
  { code: 'north_van', label: 'North van' },
  { code: 'west_van', label: 'West van' },
  { code: 'linen_cupboard', label: 'Linen cupboard' },
  { code: 'property_store', label: 'Property store' },
];

export const SUPPLY_CATALOG: SupplyCatalogItem[] = [
  { id: 'linen-bath-towel', name: 'Bath towel', category: 'linen', unit: 'pc', defaultUnitCost: 190, currency: 'MUR', defaultLocationCode: 'linen_cupboard' },
  { id: 'linen-pool-towel', name: 'Pool towel', category: 'linen', unit: 'pc', defaultUnitCost: 240, currency: 'MUR', defaultLocationCode: 'linen_cupboard' },
  { id: 'amenity-toilet-roll', name: 'Toilet roll', category: 'amenity', unit: 'roll', defaultUnitCost: 32, currency: 'MUR', defaultLocationCode: 'main_store' },
  { id: 'amenity-hand-soap', name: 'Hand soap refill', category: 'amenity', unit: 'bottle', defaultUnitCost: 95, currency: 'MUR', defaultLocationCode: 'main_store' },
  { id: 'cleaning-trash-bag', name: 'Trash bag', category: 'cleaning', unit: 'bag', defaultUnitCost: 18, currency: 'MUR', defaultLocationCode: 'main_store' },
  { id: 'welcome-water', name: 'Welcome water', category: 'welcome', unit: 'bottle', defaultUnitCost: 28, currency: 'MUR', defaultLocationCode: 'main_store' },
  { id: 'welcome-basket', name: 'Welcome basket', category: 'welcome', unit: 'set', defaultUnitCost: 650, currency: 'MUR', defaultLocationCode: 'main_store' },
  { id: 'maintenance-aa-battery', name: 'AA batteries', category: 'maintenance', unit: 'pack', defaultUnitCost: 125, currency: 'MUR', defaultLocationCode: 'main_store' },
  { id: 'maintenance-bulb', name: 'LED bulb', category: 'maintenance', unit: 'pc', defaultUnitCost: 150, currency: 'MUR', defaultLocationCode: 'main_store' },
];

export const SUPPLY_BY_ID = SUPPLY_CATALOG.reduce(
  (acc, item) => ({ ...acc, [item.id]: item }),
  {} as Record<string, SupplyCatalogItem>,
);

export function stockLocationLabel(code?: string): string {
  if (!code) return 'No location';
  return STOCK_LOCATION_OPTIONS.find((location) => location.code === code)?.label || code.replace(/_/g, ' ');
}

export function suggestSupplyLoadout(task: Pick<Task, 'department' | 'subdepartment' | 'propertyCode' | 'template' | 'tags'>): SupplyLoadoutItem[] {
  const property = PROPERTY_BY_CODE[task.propertyCode];
  if (!property || task.propertyCode === 'OFFICE') return [];

  const bathrooms = Math.max(1, property.bathrooms ?? 1);
  const bedrooms = Math.max(1, property.bedrooms || 1);
  const occupancy = Math.max(2, property.maxOccupancy || bedrooms * 2);
  const template = (task.template || '').toLowerCase();
  const tags = (task.tags || []).map((tag) => tag.toLowerCase());
  const cleaningTask =
    task.department === 'cleaning' ||
    task.subdepartment === 'post_clean' ||
    template.includes('clean');
  const welcomeTask =
    task.subdepartment === 'amenities' ||
    task.subdepartment === 'pre_arrival' ||
    template.includes('amenities') ||
    tags.includes('arrival') ||
    tags.includes('pre-arrival');
  const maintenanceTask = task.department === 'maintenance';
  const hasPool = property.amenities?.includes('pool') || property.listingType === 'villa';
  const out: SupplyLoadoutItem[] = [];

  const add = (id: string, quantity: number, reason: string) => {
    const item = SUPPLY_BY_ID[id];
    if (!item || quantity <= 0) return;
    out.push({ ...item, quantity, reason });
  };

  if (cleaningTask) {
    add('linen-bath-towel', occupancy, `${occupancy} guest capacity`);
    if (hasPool) add('linen-pool-towel', occupancy, 'Pool/beach-ready setup');
    add('amenity-toilet-roll', bathrooms * 2, `${bathrooms} bathroom restock`);
    add('amenity-hand-soap', bathrooms, `${bathrooms} bathroom restock`);
    add('cleaning-trash-bag', Math.max(2, bedrooms), 'Turnover reset');
  }

  if (welcomeTask) {
    add('welcome-water', occupancy, `${occupancy} guest welcome setup`);
    add('welcome-basket', 1, 'Arrival amenity');
  }

  if (maintenanceTask) {
    add('maintenance-aa-battery', 1, 'Remote / lock / sensor fallback');
    add('maintenance-bulb', 2, 'Common maintenance consumable');
  }

  return out;
}
