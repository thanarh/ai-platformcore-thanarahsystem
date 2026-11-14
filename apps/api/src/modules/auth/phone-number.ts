import { BadRequestException } from '@nestjs/common';
import { getCountries, parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js/max';

export function normalizeAuthPhone(value: unknown, country?: string): string {
  if (typeof value === 'string') {
    value = value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0));
  }
  if (typeof value !== 'string' || value.length > 50 || !/^\+?[\d\s().-]+$/.test(value.trim())) {
    throw new BadRequestException('أدخل رقم جوال صالحًا واختر الدولة الصحيحة.');
  }
  if (country !== undefined && !getCountries().includes(country as CountryCode)) {
    throw new BadRequestException('اختر دولة صالحة.');
  }
  try {
    const phone = parsePhoneNumberWithError(value.trim(), {
      defaultCountry: country as CountryCode | undefined,
      extract: false,
    });
    if (!phone.isValid() || !phone.country || (country && phone.country !== country)) {
      throw new Error('Invalid country or phone');
    }
    return phone.number;
  } catch {
    throw new BadRequestException('رقم الجوال غير صالح للدولة المحددة. تحقق من الرقم ورمز الدولة.');
  }
}
