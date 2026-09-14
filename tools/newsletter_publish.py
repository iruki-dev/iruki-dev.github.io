#!/usr/bin/env python3
"""Issue 본문을 뉴스레터 파일로 변환하고 발행 이력을 갱신합니다.

GitHub Actions에서만 호출됩니다. 루틴 세션은 이 스크립트를 실행하지 않습니다.

  usage: newsletter_publish.py <issue-title> <issue-body-file>

검증에 실패하면 사유를 stderr로 출력하고 종료 코드 1을 냅니다.
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "content" / "newsletter"
HISTORY = ROOT / "public" / "newsletter-history.json"
HISTORY_DAYS = 14
MIN_BODY_CHARS = 11000

TITLE_RE = re.compile(r"^newsletter:\s*(\d{4}-\d{2}-\d{2})\s*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REQUIRED_KEYS = ("title", "description", "pubDate", "tags")


def fail(msg):
    print(f"::error::{msg}", file=sys.stderr)
    sys.exit(1)


def split_frontmatter(text):
    """--- 로 감싼 frontmatter와 본문을 분리합니다."""
    if not text.startswith("---"):
        fail("본문이 `---`로 시작하지 않습니다. frontmatter를 포함한 마크다운 전문을 그대로 넣어주세요.")
    parts = text.split("---", 2)
    if len(parts) < 3:
        fail("frontmatter 종료 구분선(`---`)을 찾지 못했습니다.")
    return parts[1], parts[2]


def parse_frontmatter(raw):
    """검증에 필요한 최소한만 읽는 단순 파서 (중첩 구조는 쓰지 않습니다)."""
    data = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        data[key.strip()] = value.strip()
    return data


def unquote(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def drop_section(body, heading):
    """지정한 `##` 섹션 전체를 잘라냅니다."""
    m = re.search(rf"^##\s*{re.escape(heading)}.*$", body, re.M)
    if not m:
        return body
    rest = body[m.end():]
    nxt = re.search(r"^##\s", rest, re.M)
    return body[: m.start()] + (rest[nxt.start():] if nxt else "")


def extract_items(body):
    """`- **제목** — 내용` 형식 항목의 제목을 모읍니다.

    요약 섹션은 본문 항목을 되풀이할 뿐이라 이력에서 제외합니다.
    """
    for heading in ("한눈에", "오늘의 헤드라인"):
        body = drop_section(body, heading)
    seen, items = set(), []
    for m in re.finditer(r"^\s*[-*]\s+\*\*(.+?)\*\*", body, re.M):
        title = m.group(1).strip()
        if title not in seen:
            seen.add(title)
            items.append(title)
    return items


def extract_after_dash(body, heading):
    """`## 오늘의 단어 — 통상임금` 같은 제목에서 뒷부분만 떼어냅니다."""
    m = re.search(rf"^##\s*{re.escape(heading)}\s*[—\-–]\s*(.+)$", body, re.M)
    return m.group(1).strip() if m else ""


def extract_subheads(body, heading):
    """지정한 `##` 섹션 안의 `###` 소제목을 모읍니다."""
    m = re.search(rf"^##\s*{re.escape(heading)}.*$", body, re.M)
    if not m:
        return []
    rest = body[m.end():]
    nxt = re.search(r"^##\s", rest, re.M)
    section = rest[: nxt.start()] if nxt else rest
    return [s.strip() for s in re.findall(r"^###\s+(.+)$", section, re.M)]


def build_history():
    """발행된 모든 레터에서 최근 HISTORY_DAYS일치 요약을 다시 만듭니다."""
    entries = []
    for path in sorted(OUT_DIR.glob("*.md"))[-HISTORY_DAYS:]:
        text = path.read_text(encoding="utf-8")
        try:
            fm_raw, body = split_frontmatter(text)
        except SystemExit:
            continue
        fm = parse_frontmatter(fm_raw)
        entries.append({
            "date": path.stem,
            "title": unquote(fm.get("title", "")),
            "items": extract_items(body),
            "word": extract_after_dash(body, "오늘의 단어"),
            "liberalArts": extract_subheads(body, "오늘의 교양"),
        })
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    HISTORY.write_text(
        json.dumps({"generated": entries[-1]["date"] if entries else "", "issues": entries},
                   ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return len(entries)


def main():
    if len(sys.argv) != 3:
        fail("usage: newsletter_publish.py <issue-title> <issue-body-file>")

    title_match = TITLE_RE.match(sys.argv[1].strip())
    if not title_match:
        fail("이슈 제목은 `newsletter: YYYY-MM-DD` 형식이어야 합니다.")
    date = title_match.group(1)
    if not DATE_RE.match(date):
        fail(f"날짜 형식이 올바르지 않습니다: {date}")

    text = Path(sys.argv[2]).read_text(encoding="utf-8").replace("\r\n", "\n").strip()
    # 이슈 편집기가 코드펜스를 두른 경우 벗겨냅니다.
    fence = re.match(r"^```[a-zA-Z]*\n(.*)\n```$", text, re.S)
    if fence:
        text = fence.group(1).strip()

    fm_raw, body = split_frontmatter(text)
    fm = parse_frontmatter(fm_raw)

    missing = [k for k in REQUIRED_KEYS if k not in fm]
    if missing:
        fail(f"frontmatter에 필수 항목이 없습니다: {', '.join(missing)}")

    pub_date = unquote(fm["pubDate"])
    if pub_date != date:
        fail(f"pubDate({pub_date})가 이슈 제목의 날짜({date})와 다릅니다.")

    if not fm["tags"].startswith("["):
        fail("tags는 `[\"뉴스레터\", ...]` 형태의 배열이어야 합니다.")

    body_len = len(body.strip())
    if body_len < MIN_BODY_CHARS:
        fail(f"본문이 {body_len}자로 하한({MIN_BODY_CHARS}자)에 못 미칩니다.")

    target = OUT_DIR / f"{date}.md"
    if target.exists():
        fail(f"{target.relative_to(ROOT)} 가 이미 있습니다. 이중 발행을 막기 위해 중단합니다.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target.write_text(text + "\n", encoding="utf-8")
    count = build_history()

    summary = {"date": date, "chars": body_len, "history": count,
               "path": str(target.relative_to(ROOT))}
    print(json.dumps(summary, ensure_ascii=False))
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"date={date}\nchars={body_len}\n")


if __name__ == "__main__":
    main()
