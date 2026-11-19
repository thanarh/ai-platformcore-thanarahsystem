'use client';

import { useId, useState } from 'react';
import { ExternalLink } from 'lucide-react';

type Source = {
  id?: string;
  url?: string;
  title?: string;
  domain?: string;
  snippet?: string;
  description?: string;
  fetchState?: 'found' | 'loading' | 'complete';
};

function safeSourceUrl(value?: string): string {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function sourceDomain(source: Source, url: string): string {
  if (source.domain) return source.domain;
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

export default function SourceChips({
  sources,
  label,
}: {
  sources: Source[];
  label: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const panelId = useId();
  const items = sources.slice(0, 8);
  const selected = selectedIndex === null ? null : items[selectedIndex];
  const selectedUrl = selected ? safeSourceUrl(selected.url) : '';
  const selectedTitle = selected?.title?.trim() || '';
  const showOriginalTitle = selectedTitle && !containsCjk(selectedTitle);
  const excerpt = String(selected?.snippet || selected?.description || '').trim().slice(0, 220);
  const visibleExcerpt = excerpt && !containsCjk(excerpt) ? excerpt : '';

  if (!items.length) return null;

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex flex-wrap items-center gap-2" role="list" aria-label={label}>
        {items.map((source, index) => {
          const isSelected = selectedIndex === index;
          const stateClass = source.fetchState === 'loading'
            ? 'border-amber-300 bg-amber-50 text-amber-700'
            : source.fetchState === 'complete'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-gray-200 bg-white text-gray-600';

          return (
            <div key={`${source.id || source.url || 'source'}-${index}`} role="listitem">
              <button
                type="button"
                aria-label={`عرض تفاصيل المصدر ${index + 1}`}
                aria-expanded={isSelected}
                aria-controls={panelId}
                title={`المصدر ${index + 1}`}
                onClick={() => setSelectedIndex(isSelected ? null : index)}
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-thanarah-500 focus-visible:ring-offset-2 ${stateClass} ${
                  isSelected ? 'ring-2 ring-thanarah-300 ring-offset-1' : 'hover:border-thanarah-300 hover:bg-thanarah-50'
                }`}
              >
                {index + 1}
              </button>
            </div>
          );
        })}
      </div>

      {selected && selectedIndex !== null && (
        <div
          id={panelId}
          role="region"
          aria-label={`تفاصيل المصدر ${selectedIndex + 1}`}
          className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-800">
              {showOriginalTitle || sourceDomain(selected, selectedUrl) || `المصدر ${selectedIndex + 1}`}
            </p>
            {showOriginalTitle && sourceDomain(selected, selectedUrl) && (
              <p className="truncate text-gray-500" dir="ltr">{sourceDomain(selected, selectedUrl)}</p>
            )}
            {visibleExcerpt && <p className="mt-1 line-clamp-2 text-gray-600">{visibleExcerpt}</p>}
            {selected.fetchState && (
              <p className="mt-1 text-gray-500">
                {selected.fetchState === 'loading'
                  ? 'جارٍ التحقق من المصدر'
                  : selected.fetchState === 'complete'
                    ? 'تم فتح المصدر'
                    : 'من نتائج البحث'}
              </p>
            )}
          </div>
          {selectedUrl ? (
            <a
              href={selectedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-thanarah-50 px-2.5 py-1.5 font-medium text-thanarah-700 hover:bg-thanarah-100"
            >
              فتح المصدر
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : (
            <span className="shrink-0 text-gray-400">الرابط غير متاح</span>
          )}
        </div>
      )}
    </div>
  );
}
