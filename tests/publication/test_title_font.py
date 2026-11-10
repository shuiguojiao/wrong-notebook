"""验证标题字体字符集，无需安装 fonttools。"""

import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("subset_title_font", ROOT / "scripts/fonts/subset-title-font.py")
title_font = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(title_font)


class TitleFontCharactersTests(unittest.TestCase):
    def test_level_one_boundaries_and_count(self):
        characters = title_font.gb2312_level_one()
        self.assertEqual(len(characters), 3755)
        for code in [b"\xb0\xa1", b"\xb0\xfe", b"\xd7\xf9"]:
            self.assertIn(code.decode("gb2312"), characters)
        self.assertNotIn(b"\xd8\xa1".decode("gb2312"), characters)

    def test_union_preserves_all_source_characters_and_is_sorted(self):
        source = "错题阿喵龘\n\t🙂错题"
        characters = title_font.generate_characters(source)
        self.assertEqual(characters, sorted(set(characters)))
        self.assertTrue(set(source).issubset(characters))
        self.assertTrue(title_font.gb2312_level_one().issubset(characters))
        self.assertTrue(set(title_font.CHINESE_PUNCTUATION).issubset(characters))
        self.assertTrue({chr(code) for code in range(0x20, 0x7F)}.issubset(characters))
        self.assertEqual(characters, title_font.generate_characters(source[::-1]))

    def test_repository_translations_are_fully_included(self):
        source = (ROOT / "src/lib/i18n/zh.ts").read_text(encoding="utf-8")
        self.assertTrue(set(source).issubset(title_font.generate_characters(source)))


if __name__ == "__main__":
    unittest.main()
