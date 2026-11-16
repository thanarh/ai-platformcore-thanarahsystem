'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export type PhoneValue = { country: CountryCode; nationalNumber: string };

export function canonicalPhone(value: PhoneValue): string {
  const phone = parsePhoneNumberFromString(value.nationalNumber, {
    defaultCountry: value.country, extract: false,
  });
  if (!phone?.isValid() || phone.country !== value.country) {
    throw new Error('رقم الجوال غير صالح للدولة المحددة. تحقق من الرقم ورمز الدولة.');
  }
  return phone.number;
}

export function PhoneNumberField({
  value, onChange, disabled = false, id,
}: {
  value: PhoneValue; onChange: (value: PhoneValue) => void; disabled?: boolean; id: string;
}) {
  const [search, setSearch] = useState('');
  const [localizedCountryNames, setLocalizedCountryNames] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => setLocalizedCountryNames(true), []);
  const countries = useMemo(() => {
    const arabic = localizedCountryNames
      ? new Intl.DisplayNames(['ar'], { type: 'region' })
      : null;
    const english = localizedCountryNames
      ? new Intl.DisplayNames(['en'], { type: 'region' })
      : null;
    return getCountries().map((country) => ({
      country,
      name: arabic?.of(country) || country,
      englishName: english?.of(country) || country,
      dial: `+${getCountryCallingCode(country)}`,
    })).sort((a, b) => {
      if (!localizedCountryNames) return a.country < b.country ? -1 : a.country > b.country ? 1 : 0;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [localizedCountryNames]);
  const selected = countries.find((country) => country.country === value.country)!;
  const filtered = countries.filter((country) =>
    `${country.name} ${country.englishName} ${country.country} ${country.dial}`.toLowerCase().includes(search.toLowerCase().trim()),
  );

  return (
    <div className="space-y-2" dir="rtl">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 font-arabic">رقم الجوال</label>
      <div className="flex items-stretch gap-2" dir="ltr">
        <details ref={details} className="relative w-[145px] shrink-0 sm:w-[170px]">
          <summary
            aria-label={`الدولة: ${selected.name} ${selected.dial}`}
            className={`flex h-full min-h-12 list-none items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm ${disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
            tabIndex={disabled ? -1 : 0}
            onClick={(event) => { if (disabled) event.preventDefault(); }}
          >
            <span className="font-medium">{selected.dial}</span>
            <span className="truncate text-xs font-arabic" dir="rtl">{selected.name}</span>
          </summary>
          {!disabled && (
            <div className="absolute left-0 top-full z-30 mt-2 w-[min(300px,80vw)] rounded-xl border border-gray-200 bg-white p-2 shadow-lg" dir="rtl">
              <label htmlFor={`${id}-country-search`} className="sr-only">ابحث عن الدولة أو رمز الاتصال</label>
              <input
                id={`${id}-country-search`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث عن الدولة أو رمز الاتصال"
                className="mb-2 w-full rounded-lg border border-gray-200 p-2 text-sm outline-none focus:ring-2 focus:ring-thanarah-500"
                autoComplete="off"
              />
              <ul aria-label="الدول ورموز الاتصال" className="max-h-52 overflow-y-auto">
                {filtered.map((country) => (
                  <li key={country.country}>
                    <button type="button" className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-right text-sm hover:bg-thanarah-50 focus:bg-thanarah-50"
                      onClick={() => {
                        onChange({ ...value, country: country.country });
                        setSearch('');
                        if (details.current) details.current.open = false;
                      }}>
                      <span>{country.name} <span className="text-[10px] text-gray-400">{country.country}</span></span>
                      <span className="text-gray-600" dir="ltr">{country.dial}</span>
                    </button>
                  </li>
                ))}
                {!filtered.length && <li className="p-3 text-sm text-gray-500">لا توجد دولة مطابقة.</li>}
              </ul>
            </div>
          )}
        </details>
        <input
          id={id} type="tel" inputMode="tel" autoComplete="tel-national" required
          disabled={disabled} value={value.nationalNumber}
          onChange={(event) => {
            const nationalNumber = event.target.value;
            const parsed = nationalNumber.trim().startsWith('+')
              ? parsePhoneNumberFromString(nationalNumber) : undefined;
            onChange({ country: parsed?.country || value.country, nationalNumber });
          }}
          className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-3 text-base text-left outline-none focus:ring-2 focus:ring-thanarah-500 disabled:bg-gray-50 sm:text-sm"
          placeholder={value.country === 'SA' ? '5XXXXXXXX' : 'رقم الجوال'}
          dir="ltr"
        />
      </div>
      <p className="text-[11px] leading-5 text-gray-500">اختر الدولة ثم أدخل رقمك، أو الصق الرقم الدولي كاملًا.</p>
    </div>
  );
}
