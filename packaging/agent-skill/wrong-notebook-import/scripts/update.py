"""校验下载的 Skill 压缩包，再替换明确指定的安装目录；不读取或记录令牌。"""

import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
import zipfile


def version(source):
    body = re.sub(r"\A---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)", "", source)
    lines = [line for line in body.splitlines() if line.startswith("Skill-Version:")]
    if len(lines) != 1 or not re.fullmatch(r"Skill-Version: [1-9][0-9]*", lines[0]):
        raise ValueError("Skill 版本行无效")
    return int(lines[0].split(": ")[1])


def install(archive, destination):
    folder = "wrong-notebook-import"
    target = Path(os.path.abspath(os.path.expanduser(destination)))
    if target.is_symlink():
        raise ValueError("Skill 目录是符号链接，请更新链接指向的源仓库")
    if target.name != folder or not target.is_dir() or not (target / "SKILL.md").is_file():
        raise ValueError("请选择已安装的 wrong-notebook-import 目录")
    current = (target / "SKILL.md").read_text(encoding="utf-8")
    if not re.search(r"^name: wrong-notebook-import\r?$", current, re.M):
        raise ValueError("目标目录不是错题本导入 Skill")
    current_version = version(current) if "Skill-Version:" in current else 1
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)) or len(names) > 200:
            raise ValueError("压缩包包含重复文件或文件过多")
        if sum(entry.file_size for entry in entries) > 5 * 1024 * 1024:
            raise ValueError("压缩包解压后过大")
        for entry in entries:
            parts = PurePosixPath(entry.filename).parts
            mode = stat.S_IFMT(entry.external_attr >> 16)
            if (not parts or parts[0] != folder or ".." in parts
                    or PurePosixPath(entry.filename).as_posix() != entry.filename.rstrip("/")
                    or "\\" in entry.filename or entry.filename.startswith("/")
                    or mode not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise ValueError("压缩包含不安全路径或链接")
        if bundle.testzip() is not None:
            raise ValueError("压缩包校验失败")
        source = bundle.read(f"{folder}/SKILL.md").decode("utf-8")
        if not re.search(r"^name: wrong-notebook-import\r?$", source, re.M):
            raise ValueError("下载的 Skill 名称不匹配")
        latest = version(source)
        if latest < current_version:
            raise ValueError("服务器版本较旧，未覆盖本地 Skill")
        # 暂存与目标同盘，重命名失败时可以恢复原目录。
        stage = Path(tempfile.mkdtemp(prefix=".wrong-notebook-update-", dir=target.parent))
        backup = stage / "previous"
        installed = False
        try:
            bundle.extractall(stage)
            if target.is_symlink():
                raise ValueError("Skill 目录已变为符号链接，请更新源仓库")
            target.rename(backup)
            try:
                (stage / folder).rename(target)
                installed = True
            except OSError:
                backup.rename(target)
                raise
        finally:
            # 恢复失败时保留备份，不能在清理阶段删除用户原有目录。
            if backup.exists() and not installed:
                print(f"原目录保留在 {backup}，请恢复后重试", file=sys.stderr)
            else:
                shutil.rmtree(stage)
    print(f"Skill 已更新至版本 {latest}，请新建 Codex 对话生效。")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("用法：python3 update.py 下载的.zip 当前Skill目录")
        install(sys.argv[1], sys.argv[2])
    except (OSError, ValueError, KeyError, zipfile.BadZipFile):
        # 不输出异常对象，避免把外部响应内容带入终端日志。
        print("更新失败；请检查压缩包和安装目录。符号链接请更新其源仓库。", file=sys.stderr)
        sys.exit(1)
