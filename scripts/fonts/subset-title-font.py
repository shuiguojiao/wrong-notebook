#!/usr/bin/env python3
"""生成本地标题字体子集。

依赖安装：python3 -m venv /tmp/title-font-venv && /tmp/title-font-venv/bin/pip install fonttools brotli
从仓库根目录运行，--source 指向预先取得的官方 ZCOOLKuaiLe-Regular.ttf。
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import shlex
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE_SHA256 = "812a6fc1fe54b6d73a419245c32dfeba8aa33104d5be90d1cf6af082007cb71d"
SOURCE_VERSION = "Version 2.001"
DEFAULT_OUTPUT = ROOT / "src/app/fonts/ZCOOLKuaiLe-Subset.woff2"
ZH_PATH = ROOT / "src/lib/i18n/zh.ts"
MAX_SIZE = 800_000
CHINESE_PUNCTUATION = "，。！？；：、‘’“”（）【】《》〈〉〔〕［］｛｝「」『』…—·～﹏￥　"


def gb2312_level_one() -> set[str]:
    """按区位生成一级汉字，最后一区只到 D7F9，共 3755 字。"""
    return {
        bytes((row, column)).decode("gb2312")
        for row in range(0xB0, 0xD8)
        for column in range(0xA1, 0xFA if row == 0xD7 else 0xFF)
    }


def generate_characters(zh_source: str) -> list[str]:
    """保留中文文案源文件中的全部字符，合并后按 Unicode 码点排序。"""
    ascii_visible = {chr(codepoint) for codepoint in range(0x20, 0x7F)}
    return sorted(gb2312_level_one() | set(zh_source) | ascii_visible | set(CHINESE_PUNCTUATION))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="官方 TTF 文件路径")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="输出 woff2 路径")
    args = parser.parse_args()
    if args.output.suffix.lower() != ".woff2":
        parser.error("--output 必须使用 .woff2 扩展名")
    source = args.source.read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        parser.error("源字体 sha256 不匹配，拒绝生成")

    # 字符集函数与源文件校验不依赖 fonttools，便于用标准库独立测试。
    from fontTools import subset, version as fonttools_version
    from fontTools.ttLib import TTFont
    import brotli

    zh_source = ZH_PATH.read_text(encoding="utf-8")
    characters = generate_characters(zh_source)
    options = subset.Options()
    options.recalc_timestamp = False
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    with TTFont(io.BytesIO(source), recalcTimestamp=False) as font:
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=[ord(character) for character in characters])
        subsetter.subset(font)
        font.flavor = "woff2"
        output = io.BytesIO()
        font.save(output)
        supported_characters = len(font.getBestCmap())

    data = output.getvalue()
    if len(data) > MAX_SIZE:
        parser.error(f"字体为 {len(data)} 字节，超过 800KB 预算，拒绝写入")
    extra_han = {
        character for character in set(zh_source) - gb2312_level_one()
        if "\u4e00" <= character <= "\u9fff"
    }
    metadata = {
        "source_version": SOURCE_VERSION,
        "source_sha256": SOURCE_SHA256,
        "charset": "GB2312 一级汉字 ∪ zh.ts 全部字符 ∪ ASCII 可见字符 ∪ 常用中文标点",
        "character_count": len(characters),
        "supported_character_count": supported_characters,
        "extra_zh_han_count": len(extra_han),
        "zh_source_sha256": hashlib.sha256(ZH_PATH.read_bytes()).hexdigest(),
        "output_bytes": len(data),
        "output_sha256": hashlib.sha256(data).hexdigest(),
        "fonttools_version": fonttools_version,
        "brotli_version": brotli.__version__,
        # 只记录文件名，避免把本机绝对路径写进公开仓库。
        "generation_command": shlex.join([
            "python3", "scripts/fonts/subset-title-font.py",
            "--source", args.source.name, "--output", "src/app/fonts/" + args.output.name,
        ]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(data)
    args.output.with_suffix(".json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
