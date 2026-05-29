# Property Field Classification

Use the full matrix in `docs/architecture/ask-friday-property-field-classification-2026-05-29.md`.

## Public By Default When Reviewed

- public property name,
- public area/neighborhood,
- bedrooms, bathrooms, accommodates,
- public amenities,
- public photos/descriptions,
- public house rules,
- generic check-in/check-out policy.

## Guest-Scoped Only

- exact stay-specific access instructions,
- lockbox/key-safe/gate details,
- Wi-Fi credentials,
- property-specific troubleshooting for the booked stay,
- reservation-specific exceptions.

## Staff-Private

- internal property code in staff workflows,
- ops notes,
- vendor notes,
- maintenance issue history,
- task/inspection evidence,
- owner approval thresholds,
- staff workload and dispatch context.

## Restricted

- secrets/access/security data outside authenticated stay scope,
- owner financials/payouts/contracts,
- payment data,
- legal/finance/HR private records,
- raw private staff data.
