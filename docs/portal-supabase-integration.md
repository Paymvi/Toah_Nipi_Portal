# Toah Nipi Guest Portal: Supabase Integration Documentation

**Document status:** Internal technical documentation
**System:** Toah Nipi Guest Portal
**Related system:** Toah Nipi Staff Dashboard / Booking Management
**Database provider:** Supabase
**Database type:** Managed PostgreSQL
**Frontend framework:** React / Vite
**Last updated:** June 2026
**Owner / maintainer:** Toah Nipi development team

---

## 1. Purpose of This Document

This document explains the new Supabase-connected guest portal system.

The guest portal allows a retreat group leader to open a private portal link and view a limited, guest-facing version of their booking.

The portal currently supports:

* Loading booking summary information from Supabase
* Loading guest checklist items from Supabase
* Loading document metadata from Supabase
* Letting guests mark approved checklist items as ready for staff review
* Showing a safe placeholder message for file uploads until Supabase Storage is added

This document explains the architecture, security model, data flow, current limitations, and testing process for the portal.

---

## 2. High-Level Summary

Previously, the guest portal used hardcoded frontend mock data.

The old portal had a local object like:

```txt
PORTAL_RECORDS
```

with fake records such as:

```txt
oak-hill-youth
```

The new portal loads real portal data from Supabase using a private portal token in the URL.

Example portal URL:

```txt
https://portal-site-url.com/?portal=LONG_RANDOM_PORTAL_TOKEN
```

The portal token identifies one booking and allows the guest to view a sanitized version of that booking.

---

## 3. Plain-English System Diagram

```txt
Guest leader opens private portal link
  ↓
React portal reads ?portal=TOKEN from the URL
  ↓
React calls Supabase RPC function get_portal_record(TOKEN)
  ↓
Database validates the token
  ↓
Database returns only guest-safe fields for that one booking
  ↓
Portal displays checklist and document metadata
```

For guest updates:

```txt
Guest clicks Submit on an allowed checklist item
  ↓
React calls portal_mark_checklist_item_ready(TOKEN, item_id)
  ↓
Database validates the token and item permission
  ↓
Database updates the checklist item to needsReview
  ↓
Portal reloads the updated portal record
```

---

## 4. Security Model

The guest portal does not use the staff dashboard login system.

Guests should not have staff accounts and should not access the staff dashboard.

Instead, the portal uses a private token link.

The security goal is:

```txt
A guest can only access the one booking connected to their private portal token.
```

The portal should not allow anonymous users to directly browse the `bookings` table.

The safe model is:

```txt
No direct anonymous table access
+ private portal token
+ sanitized RPC function
+ limited returned fields
```

---

## 5. Important Security Rule

Do not create a broad anonymous policy like this:

```sql
create policy "anon can read bookings"
on public.bookings
for select
to anon
using (true);
```

That would expose booking data too broadly.

Also do not create a policy like this:

```sql
create policy "anon can read portal bookings"
on public.bookings
for select
to anon
using (portal_token is not null);
```

That could still allow anonymous users to query multiple portal-enabled bookings.

The guest portal should access booking information through controlled RPC functions, such as:

```txt
get_portal_record(portal_token)
```

not by directly selecting from the `bookings` table.

---

## 6. Portal Token Model

Each booking has a `portal_token`.

The token is stored on the `bookings` table.

Example field:

```txt
bookings.portal_token
```

The token should be:

* Long
* Random
* Hard to guess
* Not human-readable
* Treated like a private link

Example safe token shape:

```txt
81b9b32354bd6bf5e5151d135452f525
```

Example unsafe token shape:

```txt
oak-hill-youth
```

The old human-readable mock token was acceptable for a prototype, but real portal links should use long random tokens.

---

## 7. What the Portal Token Can Do

Anyone with a valid portal token can view that booking’s guest-facing portal.

This is similar to a private Google Drive link.

That means the token should be treated as sensitive.

Guests should be told:

```txt
Do not share this portal link outside your group leadership team.
```

If a portal link is accidentally shared, staff can rotate the booking’s `portal_token`.

---

## 8. Current Portal Data Sources

The portal currently loads from these Supabase-backed sources:

| Portal UI area        | Supabase source                               |
| --------------------- | --------------------------------------------- |
| Group name            | `bookings.organization_name`                  |
| Retreat dates         | `bookings.start_date` and `bookings.end_date` |
| Guest count           | `bookings.attendee_count`                     |
| Portal status         | `bookings.status`                             |
| Last updated          | `bookings.updated_at`                         |
| Checklist rows        | `portal_checklist_items`                      |
| Document list         | `portal_documents`                            |
| Guest “Submit” action | `portal_mark_checklist_item_ready()` RPC      |

The exact returned JSON is assembled by the database function:

```txt
get_portal_record(portal_token)
```

---

## 9. Main Database Tables

### 9.1 `bookings`

The `bookings` table remains the main source of truth for booking data.

The guest portal should only expose a limited subset of booking fields.

Guest-facing examples:

* Organization name
* Retreat dates
* Guest count
* General status
* Last updated date

Fields that should not be exposed casually:

* Internal notes
* Pricing details
* Staff-only planning fields
* Raw imported spreadsheet data
* Internal confidence/audit data
* Other guests’ bookings

---

### 9.2 `portal_checklist_items`

This table stores guest-facing checklist tasks for a booking.

Example fields:

| Field                | Meaning                                                   |
| -------------------- | --------------------------------------------------------- |
| `booking_id`         | Which booking the checklist item belongs to               |
| `item_id`            | Stable task ID, such as `contract` or `guest-count`       |
| `title`              | Guest-facing task title                                   |
| `description`        | Guest-facing task description                             |
| `status`             | Current task state                                        |
| `required`           | Whether the task is required                              |
| `due_date`           | Guest-facing due date                                     |
| `helper_text`        | Extra instructions for the guest                          |
| `guest_action`       | What the guest is allowed to do                           |
| `uploaded_file_name` | Display name of uploaded file, once uploads are connected |
| `sort_order`         | Display order                                             |

Supported status values:

```txt
notStarted
waitingOnGuest
needsReview
completed
ready
```

Supported guest action values:

```txt
none
mark_ready
upload_file
```

Plain meaning:

| `guest_action` | Meaning                                                      |
| -------------- | ------------------------------------------------------------ |
| `none`         | Guest cannot change this item                                |
| `mark_ready`   | Guest can click Submit to mark it ready for staff review     |
| `upload_file`  | Guest will eventually be able to upload a file for this item |

---

### 9.3 `portal_documents`

This table stores document metadata for the guest portal.

It does not necessarily store the file itself.

Example fields:

| Field               | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `booking_id`        | Which booking the document belongs to                 |
| `item_id`           | Related checklist item, if any                        |
| `title`             | Guest-facing document title                           |
| `document_type`     | Staff Document, Information Sheet, Guest Upload, etc. |
| `file_name`         | Display file name                                     |
| `status`            | Document status                                       |
| `note`              | Guest-facing note                                     |
| `storage_bucket`    | Future Supabase Storage bucket                        |
| `storage_path`      | Future Supabase Storage path                          |
| `uploaded_by_guest` | Whether the document came from the guest              |

Current document support is metadata-only.

Actual upload/download behavior is not connected yet.

---

## 10. Main Database Functions

### 10.1 `get_portal_record(p_portal_token text)`

This function is the main guest-facing read function.

It accepts a portal token and returns one sanitized JSON object.

Expected behavior:

```txt
Valid token = returns one portal record
Invalid token = returns null
Missing token = returns null
Short token = returns null
```

The function should return fields like:

```txt
id
portalToken
groupName
contactName
contactEmail
staffEmail
retreatDates
guestCount
status
lastUpdated
checklistItems
documents
```

The function should not return full raw booking records.

It should only return guest-safe fields.

---

### 10.2 `portal_mark_checklist_item_ready(p_portal_token text, p_item_id text)`

This function allows a guest to mark a permitted checklist item as ready for staff review.

Expected behavior:

```txt
Valid token + valid item + guest_action = mark_ready
  ↓
Item status becomes needsReview
```

The function should not allow guests to update arbitrary checklist items.

It should only update rows where:

```txt
booking_id matches the token
item_id matches the requested item
guest_action = mark_ready
status is not already completed or needsReview
```

After updating, the function returns the updated portal record.

---

## 11. Frontend Files

The current portal frontend uses these important pieces:

| File                            | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `src/App.jsx`                   | Main portal UI and state handling             |
| `src/services/portalService.js` | Calls Supabase RPC functions                  |
| `src/lib/supabaseClient.js`     | Creates the Supabase browser client           |
| `.env.local`                    | Stores local Supabase URL and publishable key |
| `src/App.css`                   | Portal styling                                |

---

## 12. Frontend Data Flow

### Loading the portal

The app reads the portal token from the URL:

```txt
?portal=TOKEN
```

If no token exists, the app shows:

```txt
Portal unavailable
This portal link is missing a portal token.
```

If a token exists, the app calls:

```txt
fetchPortalRecord(portalToken)
```

The service calls Supabase:

```txt
supabase.rpc("get_portal_record", {
  p_portal_token: portalToken
})
```

If the token is valid, the returned JSON is stored in React state as:

```txt
portalRecord
```

Then the app displays:

* Header
* Summary cards
* Progress bar
* Checklist tab
* Documents tab

---

### Updating a checklist item

When the guest clicks Submit on an allowed item, the app calls:

```txt
markPortalItemReady(portalToken, item.id)
```

That calls the Supabase RPC function:

```txt
portal_mark_checklist_item_ready
```

If successful, Supabase returns the updated portal record.

React then updates:

```txt
portalRecord
```

This means the UI stays in sync with the database.

---

## 13. Current Frontend Behavior

The current portal supports:

| Feature                                    | Status                          |
| ------------------------------------------ | ------------------------------- |
| Read portal token from URL                 | Working                         |
| Show error if token is missing             | Working                         |
| Load portal record from Supabase           | Working                         |
| Show invalid/expired token error           | Working if backend returns null |
| Display booking summary                    | Working                         |
| Display checklist rows                     | Working                         |
| Display document metadata                  | Working                         |
| Guest Submit button for mark-ready items   | Working if RPC is installed     |
| File upload button                         | Placeholder only                |
| File download/open button                  | Placeholder only                |
| Staff login                                | Not used for guest portal       |
| Direct `bookings` table access from portal | Should not be used              |

---

## 14. Current Limitations

The portal is connected to Supabase for metadata, but it is not complete yet.

Known limitations:

1. File uploads are not connected yet.
2. File downloads are not connected yet.
3. Checklist due dates may still be seeded/test dates.
4. Checklist templates may need to be generated automatically from booking dates.
5. Guest count is currently a “Submit” action, not a real editable field.
6. Portal links do not currently have expiration dates.
7. Portal links should be rotated if accidentally shared.
8. Staff-facing management of portal checklist items may still need dashboard UI work.
9. Supabase Storage policies still need to be designed.
10. Uploaded documents need staff review workflow integration.

---

## 15. File Upload Status

The current file upload button does not save files.

Current behavior:

```txt
Guest selects a file
  ↓
Portal shows an alert
  ↓
No file is uploaded
  ↓
No database row is created
```

This is intentional for the current phase.

Recommended future implementation:

```txt
Supabase Storage private bucket
+ Edge Function or secure upload flow
+ portal token validation
+ portal_documents metadata row
+ staff review workflow
```

The browser frontend must not use a service-role key for uploads.

If a service-role key is needed, it should only be used in a secure server-side environment such as an Edge Function.

---

## 16. Recommended Future File Upload Flow

Future guest upload flow:

```txt
Guest opens portal link
  ↓
Guest selects file
  ↓
Frontend sends file + portal token + item_id to secure upload function
  ↓
Server validates portal token
  ↓
Server validates that item allows upload_file
  ↓
File is stored in private Supabase Storage bucket
  ↓
portal_documents row is created or updated
  ↓
portal_checklist_items row changes to needsReview
  ↓
Staff reviews the uploaded document
```

Future download flow:

```txt
Guest clicks Open/Download
  ↓
Frontend requests a signed URL or secure document link
  ↓
Server validates portal token
  ↓
Server returns temporary signed download URL
  ↓
Guest can access only allowed files for their booking
```

---

## 17. Private Portal Link Notice

The old mock notice said the portal was not yet validated by the backend.

That is now outdated.

The portal notice should say something like:

```txt
Private portal link:
This page is connected to your booking through a private portal link.
Please do not share this link outside your group leadership team.
```

The portal should not display the full token again in the page body.

The token is already visible in the URL, but repeating it in the UI is unnecessary.

---

## 18. Testing Checklist

### Test 1: Missing token

Open:

```txt
http://localhost:5173/
```

Expected result:

```txt
Portal unavailable
This portal link is missing a portal token.
```

---

### Test 2: Invalid token

Open:

```txt
http://localhost:5173/?portal=fake-token
```

Expected result:

```txt
Portal unavailable
This portal link is invalid or has expired.
```

---

### Test 3: Valid token

Find a real portal token:

```sql
select
  id,
  organization_name,
  portal_token
from public.bookings
order by created_at desc
limit 10;
```

Open:

```txt
http://localhost:5173/?portal=PASTE_PORTAL_TOKEN_HERE
```

Expected result:

```txt
Portal loads the correct booking name, dates, guest count, checklist, and documents.
```

---

### Test 4: Confirm backend data

Temporarily update the booking’s attendee count:

```sql
update public.bookings
set attendee_count = '56'
where portal_token = 'PASTE_PORTAL_TOKEN_HERE';
```

Refresh the portal.

Expected result:

```txt
The group size changes to 56.
```

Restore the original value afterward if needed.

---

### Test 5: Submit guest-count item

Click Submit on an item with:

```txt
guestAction = mark_ready
```

Expected result:

```txt
The item changes to In Review / Submitted.
```

Refresh the page.

Expected result:

```txt
The item remains In Review / Submitted.
```

This confirms the update is saved in Supabase.

---

### Test 6: Upload button

Click an upload button.

Expected result for the current phase:

```txt
An alert appears saying file uploads are not connected yet.
No file is uploaded.
```

This is expected until Supabase Storage is implemented.

---

## 19. Production Readiness Checklist

Before using the portal with real guests:

```txt
[ ] Guest portal uses long random portal tokens, not human-readable tokens.
[ ] No broad anon select policy exists on bookings.
[ ] No broad anon select policy exists on portal_checklist_items.
[ ] No broad anon select policy exists on portal_documents.
[ ] get_portal_record returns only guest-safe fields.
[ ] portal_mark_checklist_item_ready only updates permitted items.
[ ] Missing token page works.
[ ] Invalid token page works.
[ ] Valid token page works.
[ ] Guest checklist updates persist after refresh.
[ ] Portal notice no longer says “mock portal.”
[ ] Portal notice warns guests not to share the link.
[ ] Upload buttons clearly say uploads are not connected yet, or uploads are fully implemented.
[ ] File download buttons clearly say downloads are not connected yet, or downloads are fully implemented.
[ ] Staff understand that portal tokens are private links.
[ ] Staff know how to rotate a portal token if needed.
```

---

## 20. How to Rotate a Portal Token

If a private portal link is accidentally shared, rotate the token.

Example:

```sql
update public.bookings
set portal_token = encode(gen_random_bytes(16), 'hex')
where id = 'BOOKING_ID_HERE';
```

Then retrieve the new token:

```sql
select
  id,
  organization_name,
  portal_token
from public.bookings
where id = 'BOOKING_ID_HERE';
```

The old portal link will stop working.

The new portal link should be sent only to the appropriate group leader.

---

## 21. Recommended Staff Workflow

For each booking that needs a portal:

1. Confirm the booking exists in Supabase.
2. Confirm the booking has a `portal_token`.
3. Create or generate checklist rows in `portal_checklist_items`.
4. Add any document metadata rows in `portal_documents`.
5. Copy the portal token.
6. Send the private portal link to the group leader.
7. Ask the group leader not to share it outside the leadership team.
8. Monitor checklist statuses from the staff dashboard or Supabase.
9. Review items marked `needsReview`.
10. Mark items complete once approved.

---

## 22. Recommended Future Staff Dashboard Integration

The staff dashboard should eventually include portal management tools.

Recommended future staff dashboard features:

* Generate portal link button
* Rotate portal token button
* Copy portal link button
* Create checklist from template button
* Edit checklist due dates
* Add staff documents
* Review guest uploads
* Mark checklist items complete
* See portal progress from booking detail page
* Disable portal access if needed

---

## 23. Recommended Future Database Additions

Possible future improvements:

```txt
portal_enabled boolean
portal_expires_at timestamptz
portal_last_viewed_at timestamptz
portal_view_count integer
guest_contact_email text
guest_contact_name text
```

These are not required for the current version but may help later.

---

## 24. Recommended Future Security Additions

Future portal security improvements:

1. Add optional portal expiration dates.
2. Add portal access logging.
3. Add token rotation from staff dashboard.
4. Add rate limiting through an Edge Function.
5. Add signed download URLs for files.
6. Add private Supabase Storage bucket policies.
7. Add staff approval workflow for uploads.
8. Add email verification for especially sensitive documents.

The current token-based portal is acceptable as a private-link workflow, but file uploads and downloads should be designed carefully before real documents are shared.

---

## 25. Deployment Notes

The portal frontend needs the following environment variables:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Do not commit `.env.local`.

Do not put secret keys in the frontend.

Allowed in frontend:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Never allowed in frontend:

```txt
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SECRET_KEY
DATABASE_URL
POSTGRES_PASSWORD
```

---

## 26. Troubleshooting

### Portal says token is missing

Cause:

```txt
The URL does not include ?portal=TOKEN
```

Fix:

```txt
Use a valid portal URL with a token.
```

---

### Portal says token is invalid or expired

Possible causes:

```txt
The token does not exist in bookings.portal_token.
The token was copied incorrectly.
The token was rotated.
The backend function returned null.
```

Fix:

```sql
select
  id,
  organization_name,
  portal_token
from public.bookings
where portal_token = 'PASTE_TOKEN_HERE';
```

---

### Portal loads but checklist is empty

Possible cause:

```txt
The booking exists, but no rows exist in portal_checklist_items for that booking.
```

Fix:

```sql
select *
from public.portal_checklist_items
where booking_id = 'BOOKING_ID_HERE'
order by sort_order;
```

---

### Portal loads but documents are empty

Possible cause:

```txt
The booking exists, but no rows exist in portal_documents for that booking.
```

Fix:

```sql
select *
from public.portal_documents
where booking_id = 'BOOKING_ID_HERE'
order by created_at desc;
```

---

### Submit button does not work

Possible causes:

```txt
The item does not have guest_action = mark_ready.
The RPC function is missing.
The RPC execute grant is missing.
The portal token is invalid.
The item status is already completed or needsReview.
```

Fix:

```sql
select
  item_id,
  status,
  guest_action
from public.portal_checklist_items
where booking_id = 'BOOKING_ID_HERE'
order by sort_order;
```

---

### Upload button only shows alert

This is expected for the current phase.

File uploads are not connected yet.

Next step:

```txt
Implement Supabase Storage upload flow.
```

---

## 27. Current Status Summary

Current phase:

```txt
Portal metadata connected to Supabase.
```

Working:

```txt
Private portal token loading
Booking summary display
Checklist display
Document metadata display
Guest mark-ready action
Missing/invalid token handling
```

Not yet complete:

```txt
Real file uploads
Real file downloads
Staff dashboard portal management UI
Automatic checklist generation
Portal expiration/logging
```


## 29. Plain-English Summary

The guest portal is now connected to Supabase.

It no longer depends on hardcoded fake portal records.

A guest opens a private portal link, the frontend sends the token to Supabase, and Supabase returns a sanitized portal record for that one booking.

The portal currently supports reading booking/checklist/document metadata and marking certain checklist items as ready for staff review.

File upload/download support is intentionally not complete yet and should be implemented separately using Supabase Storage and a secure token-validated upload/download flow.

The important security rule is:

```txt
Guests should never have broad database access.
Guests should only see the one portal record connected to their private token.
```
