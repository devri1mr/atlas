/**
 * Super Admin accounts have unrestricted access to everything in Atlas,
 * including owner-only features like Admin Pay.
 *
 * To grant super admin access to another account, add their email here.
 */
export const SUPER_ADMIN_EMAILS: string[] = [
  "matthew@garpielgroup.com",
];

export function isSuperAdmin(email: string | null | undefined): boolean {
  return SUPER_ADMIN_EMAILS.includes((email ?? "").trim().toLowerCase());
}
