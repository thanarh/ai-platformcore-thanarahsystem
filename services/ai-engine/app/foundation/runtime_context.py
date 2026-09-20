from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True)
class UserRuntimeContext:
    """Request-scoped time and language context; never derives precise location."""

    user_id: Optional[str]
    tenant_id: str
    timezone_name: str = "UTC"
    locale: str = "en-US"
    language: str = "en"
    timezone_valid: bool = True

    @classmethod
    def from_mapping(cls, value: Optional[Dict[str, Any]], tenant_id: str, user_id: Optional[str]) -> "UserRuntimeContext":
        value = value or {}
        requested = str(value.get("timezone") or "UTC")
        try:
            ZoneInfo(requested)
            timezone_name = requested
            valid = True
        except ZoneInfoNotFoundError:
            timezone_name = "UTC"
            valid = False
        language = str(value.get("language") or "en")
        if language not in {"ar", "en"}:
            language = "en"
        return cls(
            user_id=value.get("userId") or user_id,
            tenant_id=str(value.get("tenantId") or tenant_id),
            timezone_name=timezone_name,
            locale=str(value.get("locale") or ("ar-SA" if language == "ar" else "en-US")),
            language=language,
            timezone_valid=valid,
        )

    def now(self, at: Optional[datetime] = None) -> datetime:
        instant = at or datetime.now(timezone.utc)
        if instant.tzinfo is None:
            instant = instant.replace(tzinfo=timezone.utc)
        return instant.astimezone(ZoneInfo(self.timezone_name))

    def snapshot(self, at: Optional[datetime] = None) -> Dict[str, Any]:
        current = self.now(at)
        return {
            "userId": self.user_id,
            "tenantId": self.tenant_id,
            "timezone": self.timezone_name,
            "locale": self.locale,
            "language": self.language,
            "timezoneValid": self.timezone_valid,
            "currentDate": current.date().isoformat(),
            "currentTime": current.strftime("%H:%M:%S"),
            "currentDateTime": current.isoformat(),
            "today": current.date().isoformat(),
            "tomorrow": (current + timedelta(days=1)).date().isoformat(),
            "yesterday": (current - timedelta(days=1)).date().isoformat(),
        }