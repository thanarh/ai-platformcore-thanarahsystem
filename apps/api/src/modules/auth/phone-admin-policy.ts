import { Role } from '../../common/decorators/roles.decorator';

export const PLATFORM_ADMIN_PHONES: readonly string[] = [
  ...new Set(
    (process.env.PLATFORM_ADMIN_PHONES ?? '')
      .split(',')
      .map((phone) => phone.trim())
      .filter((phone) => /^\+[1-9]\d{7,14}$/.test(phone)),
  ),
];
const adminPhones = new Set<string>(PLATFORM_ADMIN_PHONES);

/** Call only after successful OTP proof of the full, normalized phone. */
export function roleAfterPhoneVerification(phone: string, currentRole: Role = Role.TENANT_OWNER): Role {
  if (currentRole === Role.OWNER) return currentRole;
  return adminPhones.has(phone) ? Role.ADMIN : currentRole;
}
