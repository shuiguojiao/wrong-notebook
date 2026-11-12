"""在临时 Git 仓库中检查 CHANGELOG 生成脚本，不读取本仓库历史。"""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/changelog.py"
UPSTREAM = """# 更新日志

旧的说明文字。

## [2026.11.4](https://example.invalid/v2026.11.4) - 2026-11-04

### ✨ 新功能
- 上游功能
"""


class ChangelogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "测试")
        self.git("config", "user.email", "test@example.invalid")
        (self.repo / "CHANGELOG.md").write_text(UPSTREAM, encoding="utf-8")
        self.anchor = self.commit("docs: 更新 CHANGELOG，发布 v2026.11.4", "2026-11-04T12:00:00+08:00")

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args, env=None):
        return subprocess.run(["git", *args], cwd=self.repo, check=True, capture_output=True, text=True, env=env).stdout.strip()

    def commit(self, subject, when):
        env = {**os.environ, "GIT_AUTHOR_DATE": when, "GIT_COMMITTER_DATE": when}
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", subject, env=env)
        return self.git("rev-parse", "HEAD")

    def run_script(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), "--repo", str(self.repo), "--anchor", self.anchor, *args],
                              capture_output=True, text=True)

    def read(self):
        return (self.repo / "CHANGELOG.md").read_text(encoding="utf-8")

    def test_groups_by_beijing_date_and_keeps_upstream_records(self):
        self.commit("feat: 新功能甲", "2026-11-05T09:00:00+08:00")
        self.commit("fix(review): 修复乙", "2026-11-05T10:00:00+08:00")
        # UTC 16:30 是北京时间次日 00:30
        self.commit("feat: 新功能丙", "2026-11-05T16:30:00+00:00")
        self.commit("docs: 只改文档", "2026-11-06T12:00:00+08:00")
        self.commit("test: 只改测试", "2026-11-06T12:00:00+08:00")
        self.commit("随手写的提交", "2026-11-06T13:00:00+08:00")

        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        text = self.read()
        self.assertNotIn("旧的说明文字", text)
        self.assertIn("scripts/changelog.py", text)
        day6 = text.index("## 2026-11-06")
        day5 = text.index("## 2026-11-05")
        upstream = text.index("## [2026.11.4]")
        self.assertLess(day6, day5)
        self.assertLess(day5, upstream)
        self.assertIn("- 新功能丙", text[day6:day5])
        self.assertIn("### 📦 其他变更\n- 随手写的提交", text[day6:day5])
        self.assertIn("- 新功能甲", text[day5:upstream])
        self.assertIn("### 🛠 修复\n- 修复乙", text[day5:upstream])
        self.assertNotIn("只改文档", text)
        self.assertNotIn("只改测试", text)
        self.assertTrue(text.endswith("- 上游功能\n"))

    def test_regeneration_is_stable(self):
        self.commit("feat: 新功能甲", "2026-11-05T09:00:00+08:00")
        self.assertEqual(self.run_script().returncode, 0)
        first = self.read()
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(self.read(), first)
        self.assertEqual(first.count("## [2026.11.4]"), 1)

    def test_check_reads_committed_file(self):
        self.commit("feat: 新功能甲", "2026-11-05T09:00:00+08:00")
        self.assertEqual(self.run_script("--check").returncode, 1)
        self.assertEqual(self.run_script().returncode, 0)
        # 工作区已更新但未提交，检查仍按提交中的文件判断
        self.assertEqual(self.run_script("--check").returncode, 1)
        self.commit("docs: 更新 CHANGELOG", "2026-11-05T10:00:00+08:00")
        result = self.run_script("--check")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_merge_commits_are_skipped(self):
        self.git("checkout", "-q", "-b", "topic")
        self.commit("feat: 分支功能", "2026-11-05T09:00:00+08:00")
        self.git("checkout", "-q", "main")
        self.commit("fix: 主线修复", "2026-11-05T09:30:00+08:00")
        env = {**os.environ, "GIT_AUTHOR_DATE": "2026-11-05T10:00:00+08:00", "GIT_COMMITTER_DATE": "2026-11-05T10:00:00+08:00"}
        self.git("merge", "-q", "--no-ff", "-m", "merge: 合并分支", "topic", env=env)
        self.assertEqual(self.run_script().returncode, 0)
        text = self.read()
        self.assertIn("- 分支功能", text)
        self.assertIn("- 主线修复", text)
        self.assertNotIn("合并分支", text)


if __name__ == "__main__":
    unittest.main()
