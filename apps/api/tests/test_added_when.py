from datetime import datetime

from app.services.progress import added_when

NOW = datetime(2026, 11, 23, 15, 0)


def record(at: str) -> dict:
    return {"created_at": at}


def test_added_when_reads_like_the_library():
    assert added_when(record("2026-11-23T09:00:00"), NOW) == "Today"
    assert added_when(record("2026-11-22T23:30:00"), NOW) == "Yesterday"
    assert added_when(record("2026-11-19T12:00:00"), NOW) == "4 days ago"
    assert added_when(record("2026-11-02T12:00:00"), NOW) == "2 Nov 2026"
    assert added_when(record("not a date"), NOW) == ""
