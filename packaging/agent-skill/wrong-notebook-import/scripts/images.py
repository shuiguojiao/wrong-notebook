"""通过代理 REST 上传整页与框选或兼容逐题原图，并读回校验；只使用 Python 标准库，不自动重试写入。"""

import argparse
import base64
import hashlib
from http.client import HTTPException
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_IMAGE = 5 * 1024 * 1024
MAX_PAGE = 10 * 1024 * 1024
SOURCE_API = "/api/agent/source-pages"
API = "/api/agent/error-items"


class ImageError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def connection(config=None):
    if config:
        try:
            import tomllib
        except ImportError:
            raise ImageError("读取 TOML 配置需要 Python 3.11 或以上") from None
        with Path(config).open("rb") as source:
            server = tomllib.load(source)["mcp_servers"]["wrong-notebook"]
        url = server["url"]
        if not url.endswith("/api/mcp"):
            raise ImageError("配置中的 MCP 地址必须以 /api/mcp 结尾")
        url = url[:-len("/api/mcp")]
        headers = {key.lower(): value for key, value in server.get("http_headers", {}).items()}
        auth = headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            raise ImageError("配置中缺少 Bearer 请求头")
        token = auth[7:]
    else:
        url = os.environ.get("WRONG_NOTEBOOK_URL", "").rstrip("/")
        token = os.environ.get("WRONG_NOTEBOOK_TOKEN", "")
    parts = urlsplit(url)
    if (parts.scheme not in ("http", "https") or not parts.hostname or parts.username
            or parts.password or parts.query or parts.fragment or parts.path):
        raise ImageError("请配置不含凭据、路径或查询串的应用地址")
    if not token or re.search(r"\s", token):
        raise ImageError("缺少有效的代理令牌")
    return url, token


class Client:
    def __init__(self, url, token, timeout):
        self.url, self.token, self.timeout = url, token, timeout
        self.opener = build_opener(NoRedirect())

    def request(self, path, method="GET", body=None, binary=False):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {"Authorization": "Bearer " + self.token}
        if data is not None:
            headers["Content-Type"] = "application/json"
        try:
            with self.opener.open(Request(self.url + path, data=data, headers=headers, method=method),
                                  timeout=self.timeout) as response:
                if response.status != 200:
                    raise ImageError("响应状态异常，停止并检查回执")
                limit = MAX_IMAGE if binary else 16 * 1024 * 1024
                raw = response.read(limit + 1)
                if len(raw) > limit:
                    raise ImageError("响应超过大小限制")
                return raw if binary else json.loads(raw)
        except HTTPError as error:
            retry = error.headers.get("Retry-After", "")
            wait = "；按 Retry-After 等待 %s 秒后再处理" % retry if retry.isdigit() else ""
            raise ImageError("HTTP %d%s；未自动重试，请先检查回执" % (error.code, wait)) from None
        except (URLError, TimeoutError, OSError, HTTPException):
            raise ImageError("连接中断或超时；写入结果可能未知，先读回核对，禁止直接重传") from None

    def detail(self, item_id):
        offset, records, revision = 0, [], None
        while True:
            data = self.request(API + "/detail?" + urlencode({"id": item_id, "offset": offset, "limit": 50}))
            item = data["item"]
            if not re.fullmatch(r"[a-f0-9]{64}", item["revision"]):
                raise ImageError("详情缺少有效 revision，不能执行补图")
            if revision is not None and revision != item["revision"]:
                raise ImageError("分页期间题目已变化，请重新读取")
            revision = item["revision"]
            records.extend(item["records"])
            next_offset = item["nextOffset"]
            if next_offset is None:
                item["records"] = records
                if len(records) != item["recordTotal"]:
                    raise ImageError("做错记录分页不完整")
                return item
            if not isinstance(next_offset, int) or not offset < next_offset <= 100000:
                raise ImageError("做错记录分页无效")
            offset = next_offset


def image_file(filename, page=False):
    with Path(filename).open("rb") as source:
        limit = MAX_PAGE if page else MAX_IMAGE
        raw = source.read(limit + 1)
    if not raw or len(raw) > limit:
        raise ImageError("图片为空或超过 %d MiB，请先压缩" % (limit // (1024 * 1024)))
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif raw.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        raise ImageError("只支持 JPEG、PNG、WebP 图片")
    if page and mime == "image/webp":
        raise ImageError("整页只支持 JPEG、PNG，长边须不超过 4096 像素")
    return {"base64": base64.b64encode(raw).decode("ascii"), "mimeType": mime}, raw


def target(item, record_id):
    if not record_id:
        return item
    for record in item["records"]:
        if record["id"] == record_id:
            return record
    raise ImageError("未找到指定做错记录，未改为操作原题")


def verify(client, item, record_id, raw):
    if not target(item, record_id).get("originalImageUrl"):
        raise ImageError("目标缺少原题图片")
    # 始终向已配置站点的固定代理路由读取，绝不向返回地址发送令牌。
    query = {"id": item["id"]}
    if record_id:
        query["recordId"] = record_id
    received = client.request(API + "/image?" + urlencode(query), binary=True)
    expected, actual = hashlib.sha256(raw).hexdigest(), hashlib.sha256(received).hexdigest()
    if expected != actual:
        raise ImageError("原图读回 SHA-256 不一致；上传可能成功，请检查后再处理")
    return {"verified": True, "sha256": expected, "readbackSha256": actual, "bytes": len(raw)}


def source_page(value):
    if not isinstance(value, dict) or set(value) - {"pageId", "fileName", "pageNumber", "regions"}:
        raise ImageError("出处只允许 pageId、fileName、pageNumber 与 regions")
    if "pageId" in value and (not isinstance(value["pageId"], str) or not 1 <= len(value["pageId"].strip()) <= 100):
        raise ImageError("pageId 无效")
    if "fileName" in value and (not isinstance(value["fileName"], str) or not 1 <= len(value["fileName"].strip()) <= 1000):
        raise ImageError("fileName 无效")
    if "pageNumber" in value and (type(value["pageNumber"]) is not int or not 1 <= value["pageNumber"] <= 100000):
        raise ImageError("pageNumber 必须为 1～100000 的整数")
    regions = value.get("regions")
    if not isinstance(regions, list) or not 1 <= len(regions) <= 4:
        raise ImageError("每题须提供 1～4 个框选区域")
    for region in regions:
        if not isinstance(region, dict) or set(region) != {"x", "y", "width", "height"}:
            raise ImageError("区域只允许 x、y、width、height；当前接口不支持跨页框选")
        if any(type(number) not in (int, float) or not math.isfinite(number) for number in region.values()):
            raise ImageError("区域坐标必须为有限数值")
        if (not 0 <= region["x"] <= 1 or not 0 <= region["y"] <= 1
                or not 0.01 <= region["width"] <= 1 or not 0.01 <= region["height"] <= 1
                or region["x"] + region["width"] > 1.0001 or region["y"] + region["height"] > 1.0001):
            raise ImageError("框选须在整页内，宽高至少为 0.01")
    return {key: field.strip() if key in ("pageId", "fileName") else field for key, field in value.items()}


def verify_source(client, item, record_id, expected):
    selected = target(item, record_id)
    if not selected.get("originalImageUrl"):
        raise ImageError("目标缺少服务端裁出的题图")
    query = {"id": item["id"]}
    if record_id:
        query["recordId"] = record_id
    received = client.request(API + "/image?" + urlencode(query), binary=True)
    if not received:
        raise ImageError("服务端题图为空")
    # 标准库不解码裁图，保存服务端实际裁图供代理逐字查看，绝不以整页哈希代替裁图核对。
    directory = Path(tempfile.mkdtemp(prefix="wrong-notebook-preview-"))
    preview = directory / "question.jpg"
    preview.write_bytes(received)
    actual = selected.get("sourcePage")
    same = isinstance(actual, dict) and actual.get("pageId") == expected["pageId"]
    actual_regions = actual.get("regions") if isinstance(actual, dict) else None
    if not isinstance(actual_regions, list) or len(actual_regions) != len(expected["regions"]):
        same = False
    elif same:
        for saved, wanted in zip(actual_regions, expected["regions"]):
            same = (isinstance(saved, dict)
                    and saved.get("pageId", actual["pageId"]) == expected["pageId"]
                    and all(type(saved.get(key)) in (int, float) and saved[key] == number
                            for key, number in wanted.items()))
            if not same:
                break
    metadata_matches = isinstance(actual, dict) and all(
        actual.get(key) == expected[key] for key in ("fileName", "pageNumber") if key in expected)
    result = {"verified": bool(same and metadata_matches), "sourcePageVerified": bool(same and metadata_matches),
              "readbackSha256": hashlib.sha256(received).hexdigest(), "bytes": len(received),
              "previewPath": str(preview), "sourcePage": expected}
    if not result["verified"]:
        result["checkError"] = ("做错快照未返回 sourcePage，出处待核对" if record_id and actual is None
                                else "sourcePage 读回与提交不一致，请核对共享页元数据及区域")
    return result


def save_receipt(path, receipt):
    # 同目录原子替换，网络写入前先记录 pending，写入后立即保留可恢复的题目 ID。
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as out:
        temporary = Path(out.name)
        try:
            json.dump(receipt, out, ensure_ascii=False, indent=2)
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def import_images(client, manifest, receipt, persist):
    source = Path(manifest)
    items = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(items, list) or not 1 <= len(items) <= 20:
        raise ImageError("导入文件必须是 1～20 项的数组")
    payload, images, sources, pages = [], [], [], {}
    for item in items:
        fields = dict(item)
        page_path, image_path = fields.pop("pagePath", None), fields.pop("imagePath", None)
        if "image" in fields or "sourcePage" in fields or bool(page_path) == bool(image_path):
            raise ImageError("每项须且只能提供 pagePath 或兼容的 imagePath，不在文件中存放图片编码")
        if page_path:
            expected = source_page({key: fields.pop(key) for key in ("regions", "fileName", "pageNumber") if key in fields})
            path = (source.parent / page_path).resolve()
            if path not in pages:
                image, _ = image_file(path, page=True)
                pages[path] = {"image": image, "metadata": {}}
            for key in ("fileName", "pageNumber"):
                if key in expected:
                    metadata = pages[path]["metadata"]
                    if key in metadata and metadata[key] != expected[key]:
                        raise ImageError("同一 pagePath 的文件名或页码冲突，未上传")
                    metadata[key] = expected[key]
            sources.append((path, expected))
            images.append(None)
            payload.append(fields)
        else:
            if any(key in fields for key in ("regions", "fileName", "pageNumber")):
                raise ImageError("regions、fileName、pageNumber 须与 pagePath 同用")
            image, raw = image_file(source.parent / image_path)
            payload.append({**fields, "image": image})
            images.append(raw)
            sources.append(None)
    receipt["pages"] = []
    for path, page in pages.items():
        row = {"pagePath": str(path), **page["metadata"], "state": "upload_pending"}
        receipt["pages"].append(row)
        receipt["state"] = "upload_pending"
        persist()
        response = client.request(SOURCE_API, "POST", {**page["image"], **page["metadata"]})
        page_id = response.get("pageId")
        if not isinstance(page_id, str) or not page_id.strip():
            raise ImageError("上传整页未返回 pageId，请检查回执，不重传整批")
        page["pageId"] = page_id
        row.update(pageId=page_id, state="uploaded")
        persist()
    for fields, entry in zip(payload, sources):
        if entry:
            path, expected = entry
            fields["sourcePage"] = {"pageId": pages[path]["pageId"], **expected}
    # 写入结果未知时，回执仍保留每项出处，便于查到题目后执行只读 verify。
    receipt["sources"] = [{"index": index, **fields["sourcePage"]}
                          for index, fields in enumerate(payload) if "sourcePage" in fields]
    receipt["state"] = "write_pending"
    persist()
    response = client.request(API, "POST", {"items": payload})
    # 先持久化服务器逐项结果，之后的读回失败也不能丢失成功题目/重复记录的 ID。
    receipt["results"] = []
    for row in response["results"]:
        result = {key: row[key] for key in ("index", "id", "shortId", "status", "practiceRecordId", "link") if key in row}
        if "error" in row:
            result["failed"] = True
            if isinstance(row["error"], str) and re.fullmatch(r"[A-Z][A-Z0-9_]{0,79}", row["error"]):
                result["errorCode"] = row["error"]
        if type(row.get("index")) is int and 0 <= row["index"] < len(payload):
            if "sourcePage" in payload[row["index"]]:
                result["sourcePage"] = payload[row["index"]]["sourcePage"]
        receipt["results"].append(result)
    receipt["state"] = "readback_pending"
    persist()
    rows = receipt["results"]
    if len(rows) != len(items) or sorted(row["index"] for row in rows) != list(range(len(items))):
        raise ImageError("导入回执不完整，先查询已保存题目，不重传整批")
    for row in rows:
        if row.get("failed"):
            continue
        try:
            record_id = row.get("practiceRecordId")
            if row["status"] == "duplicate" and not record_id:
                raise ImageError("重复题回执缺少 practiceRecordId，需查询该次记录")
            item = client.detail(row["id"])
            if "sourcePage" in row:
                row.update(verify_source(client, item, record_id, row["sourcePage"]))
            else:
                row.update(verify(client, item, record_id, images[row["index"]]))
        except ImageError as error:
            row["checkError"] = str(error)
        persist()
    if any(not row.get("verified") for row in rows):
        raise ImageError("部分题目未通过检查；只处理回执中失败或待核对的项")


def attach_image(client, args, receipt, persist):
    image, raw = image_file(args.image)
    before = client.detail(args.id)
    selected = target(before, args.record_id)
    if args.record_id and not selected.get("editable"):
        raise ImageError("该做错记录不可通过代理接口更改")
    if selected.get("originalImageUrl") and not args.replace:
        raise ImageError("目标已有原图；确认需要替换后使用 --replace")
    row = {"id": before["id"], "recordId": args.record_id, "expectedRevision": before["revision"]}
    receipt.update(state="write_pending", results=[row])
    persist()
    body = {"id": before["id"], "expectedRevision": before["revision"], "patch": {"image": image}}
    route = "/update"
    if args.record_id:
        route = "/records/update"
        body["recordId"] = args.record_id
    client.request(API + route, "PATCH", body)
    receipt["state"] = "readback_pending"
    persist()
    after = client.detail(before["id"])
    # 补图必须保留题干、作答与记录数；记录编辑会按服务端规则重算掌握度。
    if args.record_id:
        ignored = {"revision", "updatedAt", "records", "masteryLevel", "masteryProbability",
                   "masteryReason", "masterySource", "masteryEvaluatedAt"}
        unchanged = {k: v for k, v in before.items() if k not in ignored} == {
            k: v for k, v in after.items() if k not in ignored}
        def comparable_records(item):
            return [{k: v for k, v in record.items()
                     if k != "originalImageUrl" or record["id"] != args.record_id}
                    for record in item["records"]]
        unchanged = unchanged and comparable_records(before) == comparable_records(after)
    else:
        ignored = {"revision", "updatedAt", "originalImageUrl", "sourcePage"}
        unchanged = {k: v for k, v in before.items() if k not in ignored} == {
            k: v for k, v in after.items() if k not in ignored}
        unchanged = unchanged and after.get("sourcePage") is None
    if not unchanged:
        raise ImageError("补图前后其他内容发生变化，需人工核对；未再次写入")
    row.update(verify(client, after, args.record_id, raw), otherFieldsUnchanged=True)
    persist()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", help="从指定 Codex TOML 的 wrong-notebook MCP 读取站点与令牌；需 Python 3.11+")
    parser.add_argument("--timeout", type=float, default=30)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("import", "attach", "verify"):
        command = commands.add_parser(name)
        command.add_argument("--receipt", required=True, type=Path, help="新回执路径，不覆盖已有文件")
        if name == "import":
            command.add_argument("--items", required=True, help="含 pagePath 与 regions（或兼容 imagePath）的题目数组 JSON")
        else:
            command.add_argument("--id", required=True)
            command.add_argument("--record-id", help="重复导入回执中的 practiceRecordId")
            if name == "verify":
                expected = command.add_mutually_exclusive_group(required=True)
                expected.add_argument("--image", help="兼容方式的预期逐题原图")
                expected.add_argument("--source-page", help="预期出处 JSON 文件，含 pageId、regions，可附 fileName、pageNumber")
            else:
                command.add_argument("--image", required=True, help="预期逐题原图")
        if name == "attach":
            command.add_argument("--replace", action="store_true", help="明确替换已有原图")
    args = parser.parse_args()
    receipt = {"operation": args.command, "state": "preparing", "results": []}
    reserved = False
    try:
        if not 0 < args.timeout <= 300:
            raise ImageError("超时必须在 0～300 秒之间")
        client = Client(*connection(args.config), timeout=args.timeout)
        # 同一路径拒绝覆盖，避免再次运行写操作而丢失旧回执。
        descriptor = os.open(args.receipt, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        reserved = True
        persist = lambda: save_receipt(args.receipt, receipt)
        persist()
        if args.command == "import":
            import_images(client, args.items, receipt, persist)
        elif args.command == "attach":
            attach_image(client, args, receipt, persist)
        else:
            row = {"id": args.id, "recordId": args.record_id}
            receipt.update(state="readback_pending", results=[row])
            if args.source_page:
                expected = source_page(json.loads(Path(args.source_page).read_text(encoding="utf-8")))
                if "pageId" not in expected:
                    raise ImageError("只读出处核对必须提供 pageId")
                row["sourcePage"] = expected
                persist()
                row.update(verify_source(client, client.detail(args.id), args.record_id, expected))
            else:
                _, raw = image_file(args.image)
                row.update(verify(client, client.detail(args.id), args.record_id, raw))
            persist()
            if not row["verified"]:
                raise ImageError(row["checkError"])
        receipt["state"] = "verified"
        persist()
        print("原图读回校验通过：%d 项；回执已保存。" % len(receipt["results"]))
        return 0
    except (ImageError, OSError, ValueError, KeyError, TypeError, AttributeError):
        error = sys.exc_info()[1]
        message = str(error) if isinstance(error, ImageError) else "输入、配置或响应无效；请检查回执与参数"
        if reserved:
            receipt["error"] = message
            try:
                save_receipt(args.receipt, receipt)
            except OSError:
                print("回执更新失败，请保留现有文件并先查询服务器状态。", file=sys.stderr)
        print(message, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
