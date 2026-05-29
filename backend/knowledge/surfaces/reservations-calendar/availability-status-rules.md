# Availability And Reservation Status Rules

## Status Semantics

- Null, unknown, or unconfirmed status is not confirmed occupancy.
- Confirmed, checked-in, reserved, or booked status blocks normal non-urgent Ops work during the stay.
- Cancelled, expired, denied, or closed status should not block occupancy unless another active reservation or block exists.
- Inquiry state can matter for follow-up and sales, but should not be treated as an occupied property.

## Date Semantics

- Check-in date is included in stay-night planning.
- Check-out date is excluded for stay-night occupancy and can be schedulable after checkout, unless a late checkout or operational exception is visible.
- Date-window lookups for Ops should use overlap logic, not check-in-only filtering.

## Availability And Pricing

- Missing calendar cache rows mean unknown, not available.
- Cached calendar/pricing values need source timestamps.
- If a price/rate/availability answer is public or guest-committing, prefer a live FAD public availability/search tool or quote request.
- FAD-local blocks can be used for internal planning, but they are not proof of Guesty/OTA/channel blocking.

## Safe Wording

- Say "the cache does not prove availability/price" when rows are missing or stale.
- Say "I can prepare a review request" for channel-visible writes unless an approved executor exists.
- Never say "this is blocked on Airbnb/Booking.com" from a FAD-local block alone.
