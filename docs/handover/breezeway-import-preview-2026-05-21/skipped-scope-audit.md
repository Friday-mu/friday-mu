# Breezeway skipped-row scope audit — 2026-05-21

Source: /Users/judith/Desktop/Friday/Friday OS/Ops Module

Total policy-skipped rows: **691**. These were not imported in the first production apply. The user has now clarified that GBH/Syndic and Friday/internal tasks can belong in Ops, so these are candidates for a second classified import, not junk.

## admin_property

Rows: **649**. Open-like rows: **9**. Completed/closed-like rows: **534**.

### Properties
| Property | Rows |
|---|---:|
| Office / Store / Admin | 649 |

### Statuses
| Status | Rows |
|---|---:|
| Finished | 347 |
| Closed | 187 |
| Not Started | 106 |
| In Progress | 9 |

### Departments
| Department | Rows |
|---|---:|
| Inspection | 571 |
| Cleaning | 42 |
| Maintenance | 36 |

### Sample open-like rows

```json
[
  {
    "taskId": "123645072",
    "propertyId": "1099484",
    "property": "Office / Store / Admin",
    "status": "In Progress",
    "priority": "Medium",
    "department": "Inspection",
    "subdepartment": "",
    "title": "Find Third Parties for all the Following in the North & West",
    "dueDate": "",
    "createdDate": "2025-12-07"
  },
  {
    "taskId": "120792145",
    "propertyId": "1099484",
    "property": "Office / Store / Admin",
    "status": "In Progress",
    "priority": "Medium",
    "department": "Inspection",
    "subdepartment": "",
    "title": "Inventory List of Supplies in Stock (SRL, Equipment, Maintenance stuff, etc)",
    "dueDate": "2026-04-14",
    "createdDate": "2025-11-12"
  },
  {
    "taskId": "124150234",
    "propertyId": "1099484",
    "property": "Office / Store / Admin",
    "status": "In Progress",
    "priority": "Medium",
    "department": "Inspection",
    "subdepartment": "",
    "title": "Amend T&Cs",
    "dueDate": "2026-04-14",
    "createdDate": "2025-12-11"
  },
  {
    "taskId": "124959734",
    "propertyId": "1099484",
    "property": "Office / Store / Admin",
    "status": "In Progress",
    "priority": "Medium",
    "department": "Inspection",
    "subdepartment": "",
    "title": "Change Whatsapp Name on Guesty",
    "dueDate": "2026-05-14",
    "createdDate": "2025-12-18"
  },
  {
    "taskId": "145032705",
    "propertyId": "1099484",
    "property": "Office / Store / Admin",
    "status": "In Progress",
    "priority": "Medium",
    "department": "Inspection",
    "subdepartment": "",
    "title": "Delivery bwell ( west ",
    "dueDate": "2026-05-22",
    "createdDate": "2026-04-29"
  },
  {
    "taskId": "134690811",
    "propertyId": "1099484",
    "property": "Office / Store / Admin",
    "status": "In Progress",
    "priority": "Medium",
    "department": "Inspection",
    "subdepartment": "",
    "title": "Setup Drying Rods and Cables in Store",
    "dueDate": "2026-05-25",
    "createdDate": "2026-02-20"
  },
  {
    "taskId": "136430555",
    "propertyId": "1099484",
    "property": "Office / Store / Admin",
    "status": "In Progress",
    "priority": "Medium",
    "department": "Inspection",
    "subdepartment": "",
    "title": "Setup Maintenance Area in Store",
    "dueDate": "2026-05-25",
    "createdDate": "2026-03-05"
  },
  {
    "taskId": "139318220",
    "propertyId": "1099484",
    "property": "Office / Store / Admin",
    "status": "In Progress",
    "priority": "Medium",
    "department": "Inspection",
    "subdepartment": "",
    "title": "Transfer Ownership of Scooters",
    "dueDate": "2026-05-25",
    "createdDate": "2026-03-24"
  },
  {
    "taskId": "140422442",
    "propertyId": "1099484",
    "property": "Office / Store / Admin",
    "status": "In Progress",
    "priority": "Medium",
    "department": "Inspection",
    "subdepartment": "Guest Services",
    "title": "Print Brochure House Rules & Business Cards",
    "dueDate": "2026-06-01",
    "createdDate": "2026-03-31"
  }
]
```

## aggregate_property

Rows: **42**. Open-like rows: **0**. Completed/closed-like rows: **30**.

### Properties
| Property | Rows |
|---|---:|
| Grand Baie Heights | 42 |

### Statuses
| Status | Rows |
|---|---:|
| Finished | 17 |
| Closed | 13 |
| Not Started | 12 |

### Departments
| Department | Rows |
|---|---:|
| Inspection | 19 |
| Maintenance | 13 |
| Cleaning | 10 |

### Sample open-like rows

```json
[]
```

## Readout

- The original skip rule was too broad for the final scope decision.
- Aggregate/GBH rows should be modeled as Syndic/building-scope Operations tasks, likely `source = 'syndic'`, not property-level STR tasks.
- Admin/Office/Store rows need a Friday/internal or office-task classification before import so they do not appear as field-staff property work.
- Do not run a second apply until the schema/import policy records scope/source explicitly and keeps historical/completed rows from becoming active field assignments.
