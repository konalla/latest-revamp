# Team Member Management API

## Overview
This document describes the endpoints for managing team members. Only workspace owners (admins) can perform these operations.

---

## 1. Remove Member from Team

### Endpoint Details
- **Method:** `DELETE`
- **URL:** `/api/team/members/:userId`
- **Auth Required:** Yes (Bearer Token)
- **Access:** Admin/Workspace Owner only

### Description
Removes a member from the team. Only the workspace owner (admin) can perform this action. Admins cannot remove themselves from the team.

### URL Parameters
- `userId` (required): The ID of the user to remove from the team

### Request Headers
```
Authorization: Bearer <your_jwt_token>
```

### Request Example
```http
DELETE /api/team/members/123
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Success Response
**Status Code:** `200 OK`

```json
{
  "message": "Member removed from team successfully"
}
```

### Error Responses

**Status Code:** `400 Bad Request`
```json
{
  "message": "userId parameter required"
}
```

**Status Code:** `403 Forbidden`
```json
{
  "message": "Cannot remove yourself from the team"
}
```

```json
{
  "message": "Member not found in team"
}
```

```json
{
  "message": "Admin team not found"
}
```

---

## 2. Update Member Status

### Endpoint Details
- **Method:** `PATCH`
- **URL:** `/api/team/members/:userId/status`
- **Auth Required:** Yes (Bearer Token)
- **Access:** Admin/Workspace Owner only

### Description
Updates the status of a team member. Only the workspace owner (admin) can perform this action. Valid statuses are:
- `ACTIVE` - Member is active in the team
- `INACTIVE` - Member is inactive
- `SUSPENDED` - Member is suspended
- `UNDER_REVIEW` - Member status is under review

### URL Parameters
- `userId` (required): The ID of the user whose status should be updated

### Request Headers
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

### Request Body
```json
{
  "status": "ACTIVE" | "INACTIVE" | "SUSPENDED" | "UNDER_REVIEW"
}
```

### Request Example
```http
PATCH /api/team/members/123/status
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "status": "SUSPENDED"
}
```

### Success Response
**Status Code:** `200 OK`

```json
{
  "message": "Member status updated successfully",
  "member": {
    "id": 123,
    "username": "john_doe",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "MEMBER",
    "status": "SUSPENDED"
  }
}
```

### Error Responses

**Status Code:** `400 Bad Request`
```json
{
  "message": "userId parameter required"
}
```

```json
{
  "message": "status is required"
}
```

```json
{
  "message": "Invalid status. Must be one of: ACTIVE, INACTIVE, SUSPENDED, UNDER_REVIEW"
}
```

**Status Code:** `403 Forbidden`
```json
{
  "message": "Member not found in team"
}
```

```json
{
  "message": "Admin team not found"
}
```

---

## 3. Get Team Members (Updated)

### Endpoint Details
- **Method:** `GET`
- **URL:** `/api/team/members`
- **Auth Required:** Yes (Bearer Token)
- **Access:** Admin/Workspace Owner only

### Description
Lists all members of the team. The response now includes the `status` field for each member.

### Success Response
**Status Code:** `200 OK`

```json
[
  {
    "id": 1,
    "username": "admin_user",
    "name": "Admin User",
    "email": "admin@example.com",
    "role": "ADMIN",
    "status": "ACTIVE"
  },
  {
    "id": 123,
    "username": "john_doe",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "MEMBER",
    "status": "SUSPENDED"
  },
  {
    "id": 456,
    "username": "jane_smith",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "MEMBER",
    "status": "ACTIVE"
  }
]
```

---

## Status Values Reference

| Status | Description |
|--------|-------------|
| `ACTIVE` | Member is actively participating in the team |
| `INACTIVE` | Member is inactive |
| `SUSPENDED` | Member is suspended from the team |
| `UNDER_REVIEW` | Member status is under review |

---

## Notes

1. **Admin Only:** Both endpoints require the authenticated user to be the workspace owner (admin). The system automatically verifies this by checking if the user owns the workspace associated with the team.

2. **Self-Removal Prevention:** Admins cannot remove themselves from the team via the remove member endpoint.

3. **Member Validation:** Both endpoints check if the target user is actually a member of the team before performing the operation.

4. **Status Default:** New members are automatically added with `ACTIVE` status.

5. **Role vs Status:** 
   - `role` (ADMIN/MEMBER) defines the member's permissions
   - `status` (ACTIVE/INACTIVE/SUSPENDED/UNDER_REVIEW) defines the member's current state

---

## Example Usage

### Remove a Member
```javascript
const response = await fetch('/api/team/members/123', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
// { message: "Member removed from team successfully" }
```

### Update Member Status
```javascript
const response = await fetch('/api/team/members/123/status', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: 'SUSPENDED'
  })
});

const data = await response.json();
// {
//   message: "Member status updated successfully",
//   member: { id: 123, username: "...", ... }
// }
```


