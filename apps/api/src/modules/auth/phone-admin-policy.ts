import { Role } from '../../common/decorators/roles.decorator';

const adminPhones = new Set(['+966532441566', '+966536384171']);

/** Call only after successful OTP proof of the full, normalized phone. */
export function roleAfterPhoneVerification(phone: string, currentRole: Role = Role.TENANT_OWNER): Role {
  if (currentRole === Role.OWNER) return currentRole;
  return adminPhones.has(phone) ? Role.ADMIN : currentRole;
}
