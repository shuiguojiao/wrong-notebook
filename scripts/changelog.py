#!/usr/bin/env python3
"""根据提交信息生成 CHANGELOG.md。

本 fork 不打版本标签，按提交日期（北京时间）分节：每天一节，列出 feat、fix
以及不符合提交格式的提交；docs、test、chore 等维护提交不列出。分叉前上游的
正式版记录保存在文件末尾的标记之后，原样保留。

用法：
  python3 scripts/changelog.py                # 按 HEAD 重新生成 CHANGELOG.md
  python3 scripts/changelog.py --check        # 只检查 HEAD 中的 CHANGELOG.md 是否最新
  python3 scripts/changelog.py --check --ref <提交>
"""

from __future__ import annotations

import argparse
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import subprocess
import sys

# 上游最后一个正式版 v2026.11.4 的提交；其后的改动由本脚本生成。
# 写成哈希而不是标签：本 fork 的克隆不一定带有上游标签。
ANCHOR = "65576838ffd81524631cf51ae3d7f0a783e49e6b"
BEIJING = timezone(timedelta(hours=8))
MARKER = "<!-- 以下为分叉前上游的正式版记录，由脚本原样保留 -->"
UPSTREAM_HEADING = re.compile(r"^## \[", re.MULTILINE)
CONVENTIONAL = re.compile(r"^(feat|fix|chore|ci|docs|style|refactor|perf|test|build)(\([^)]*\))?!?: ?", re.IGNORECASE)
SKIPPED = re.compile(r"^[Mm]erge[ :]|\[skip ci\]")

HEADER = """# 更新日志

本文件由 `scripts/changelog.py` 根据提交信息生成，请勿手动编辑；推送 `main` 前运行该脚本并提交。
本 fork 不打版本标签，按提交日期（北京时间）分节，只列出新功能、修复和不符合提交格式的提交；文档、测试、重构等维护提交见 Git 历史。
"""

SECTIONS = (("feat", "✨ 新功能"), ("fix", "🛠 修复"), ("other", "📦 其他变更"))


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True).stdout


def classify(subject: str) -> tuple[str, str] | None:
    """返回 (类别, 去掉类型前缀的描述)；不列出的提交返回 None。"""
    if SKIPPED.search(subject):
        return None
    match = CONVENTIONAL.match(subject)
    if not match:
        return "other", subject.strip()
    kind = match.group(1).lower()
    if kind not in ("feat", "fix"):
        return None
    return kind, subject[match.end():].strip()


def collect(repo: Path, ref: str, anchor: str = ANCHOR) -> "OrderedDict[str, dict[str, list[str]]]":
    """按日期（新到旧）汇总 anchor..ref 之间的非合并提交。"""
    log = git(repo, "log", "--no-merges", "--format=%ct%x09%s", f"{anchor}..{ref}")
    days: "OrderedDict[str, dict[str, list[str]]]" = OrderedDict()
    for line in log.splitlines():
        stamp, _, subject = line.partition("\t")
        entry = classify(subject)
        if entry is None:
            continue
        day = datetime.fromtimestamp(int(stamp), BEIJING).strftime("%Y-%m-%d")
        days.setdefault(day, {key: [] for key, _ in SECTIONS})[entry[0]].append(entry[1])
    # git log 按提交拓扑排序，合并分支后日期可能交错，这里统一按日期新到旧排列
    return OrderedDict(sorted(days.items(), key=lambda item: item[0], reverse=True))


def preserved_tail(existing: str) -> str:
    """取出需要原样保留的上游记录（不含标记行）。"""
    if MARKER in existing:
        return existing.split(MARKER, 1)[1].lstrip("\n")
    match = UPSTREAM_HEADING.search(existing)
    return existing[match.start():] if match else ""


def render(days: "OrderedDict[str, dict[str, list[str]]]", tail: str) -> str:
    parts = [HEADER]
    for day, groups in days.items():
        parts.append(f"## {day}\n")
        for key, title in SECTIONS:
            if groups[key]:
                parts.append(f"### {title}\n" + "".join(f"- {item}\n" for item in groups[key]))
    if tail:
        parts.append(MARKER + "\n\n" + tail.rstrip("\n") + "\n")
    return "\n".join(parts)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="根据提交信息生成 CHANGELOG.md")
    parser.add_argument("--ref", default="HEAD", help="生成到哪个提交，默认 HEAD")
    parser.add_argument("--check", action="store_true", help="只检查，CHANGELOG.md 不是最新时返回 1")
    parser.add_argument("--repo", default=str(Path(__file__).resolve().parents[1]), help=argparse.SUPPRESS)
    parser.add_argument("--anchor", default=ANCHOR, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    repo = Path(args.repo)
    path = repo / "CHANGELOG.md"

    if args.check:
        # 检查的是提交中的文件，而不是工作区
        try:
            existing = git(repo, "show", f"{args.ref}:CHANGELOG.md")
        except subprocess.CalledProcessError:
            existing = ""
    else:
        existing = path.read_text(encoding="utf-8") if path.exists() else ""

    content = render(collect(repo, args.ref, args.anchor), preserved_tail(existing))
    if args.check:
        if content != existing:
            print(f"CHANGELOG.md 未包含 {args.ref} 之前的全部改动，请运行 python3 scripts/changelog.py 后提交。", file=sys.stderr)
            return 1
        print("CHANGELOG.md 已是最新。", file=sys.stderr)
        return 0
    if content != existing:
        path.write_text(content, encoding="utf-8")
        print("已更新 CHANGELOG.md", file=sys.stderr)
    else:
        print("CHANGELOG.md 无需更新", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
