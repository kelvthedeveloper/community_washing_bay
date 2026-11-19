import type { ConfigurationSectionId } from "./types";

export type ConfigurationSectionKind =
  | "named"
  | "service-pricing"
  | "commission-settings";

export interface ConfigurationSection {
  id: ConfigurationSectionId;
  title: string;
  singular: string;
  description: string;
  kind: ConfigurationSectionKind;
}

export const configurationSections: ConfigurationSection[] = [
  {
    id: "vehicle-types",
    title: "Vehicle types",
    singular: "vehicle type",
    description: "Maintain the vehicle types used to organize service pricing.",
    kind: "named",
  },
  {
    id: "services",
    title: "Services",
    singular: "service",
    description: "Manage the services available in the business configuration.",
    kind: "named",
  },
  {
    id: "service-pricing",
    title: "Service pricing",
    singular: "service price",
    description:
      "Create effective-dated prices by vehicle type and service. Historical prices are retained.",
    kind: "service-pricing",
  },
  {
    id: "commission-settings",
    title: "Commission settings",
    singular: "commission setting",
    description:
      "Manage effective-dated commission percentages without overwriting history.",
    kind: "commission-settings",
  },
  {
    id: "expense-categories",
    title: "Expense categories",
    singular: "expense category",
    description: "Organize business expenses with reusable categories.",
    kind: "named",
  },
  {
    id: "inventory-categories",
    title: "Inventory categories",
    singular: "inventory category",
    description: "Organize inventory records with reusable categories.",
    kind: "named",
  },
];

export function getConfigurationSection(id: string | undefined) {
  return configurationSections.find((section) => section.id === id);
}

export function getConfigurationEndpoint(id: ConfigurationSectionId) {
  return `/v1/configuration/${id}/`;
}
