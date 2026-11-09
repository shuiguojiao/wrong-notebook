"""用传输模拟验证整页导入流程，可在禁止监听端口的沙箱中运行。"""

import argparse
import base64
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parents[2] / "packaging/agent-skill/wrong-notebook-import/scripts/images.py"
spec = importlib.util.spec_from_file_location("agent_images", SCRIPT)
images = importlib.util.module_from_spec(spec)
spec.loader.exec_module(images)
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
REGIONS = [{"x": 0.1, "y": 0.2, "width": 0.8, "height": 0.3},
           {"x": 0.2, "y": 0.7, "width": 0.5, "height": 0.2}]


class SourceImageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "page.png").write_bytes(PNG)
        self.manifest = self.root / "items.json"
        self.receipt = {"state": "preparing", "results": []}
        self.snapshots = []
        self.body = None
        self.results = [{"index": 0, "id": "item-1", "status": "created", "link": "/item-1"}]
        self.detail = {"id": "item-1", "originalImageUrl": "https://untrusted.invalid/image", "records": []}
        self.client = Mock()
        self.client.request.side_effect = self.request
        self.client.detail.side_effect = lambda _id: self.detail
        create_directory = tempfile.mkdtemp
        patcher = patch.object(images.tempfile, "mkdtemp", side_effect=lambda **kwargs: create_directory(dir=self.root, **kwargs))
        patcher.start()
        self.addCleanup(patcher.stop)

    def request(self, path, method="GET", body=None, binary=False):
        if path == images.SOURCE_API:
            return {"pageId": "page-1"}
        if path == images.API:
            self.body = body
            self.detail["sourcePage"] = body["items"][0].get("sourcePage")
            return {"results": self.results}
        self.assertTrue(binary)
        self.assertTrue(path.startswith(images.API + "/image?"))
        return PNG

    def page_item(self, **changes):
        return {"notebookId": "n", "questionText": "题干", "pagePath": "page.png",
                "regions": copy.deepcopy(REGIONS), "fileName": "试卷.pdf", "pageNumber": 2, **changes}

    def run_import(self, items=None):
        self.manifest.write_text(json.dumps(items if items is not None else [self.page_item()]))
        images.import_images(self.client, self.manifest, self.receipt,
                             lambda: self.snapshots.append(copy.deepcopy(self.receipt)))

    def test_shared_page_uploads_once_and_records_ordered_regions(self):
        self.results.append({**self.results[0], "index": 1})
        self.run_import([self.page_item(), self.page_item(pagePath="./page.png")])
        uploads = [call for call in self.client.request.call_args_list if call.args[0] == images.SOURCE_API]
        self.assertEqual(len(uploads), 1)
        self.assertEqual(uploads[0].args[2]["fileName"], "试卷.pdf")
        self.assertEqual(base64.b64decode(uploads[0].args[2]["base64"]), PNG)
        for item in self.body["items"]:
            self.assertEqual(item["sourcePage"]["pageId"], "page-1")
            self.assertNotIn("image", item)
            self.assertNotIn("pagePath", item)
        for row in self.receipt["results"]:
            self.assertTrue(row["sourcePageVerified"])
            self.assertEqual(row["sourcePage"]["regions"], REGIONS)
            self.assertEqual(Path(row["previewPath"]).read_bytes(), PNG)
            self.assertEqual(row["readbackSha256"], hashlib.sha256(PNG).hexdigest())
        self.assertEqual(self.snapshots[0]["state"], "upload_pending")
        self.assertEqual(self.snapshots[1]["pages"][0]["pageId"], "page-1")
        self.assertEqual(self.snapshots[2]["sources"][0]["regions"], REGIONS)

    def test_mixed_legacy_and_page_items_keep_legacy_hash_verification(self):
        self.results.append({**self.results[0], "index": 1})
        self.run_import([self.page_item(), {"notebookId": "n", "questionText": "旧题", "imagePath": "page.png"}])
        self.assertIn("image", self.body["items"][1])
        self.assertEqual(self.receipt["results"][1]["sha256"], hashlib.sha256(PNG).hexdigest())

    def test_invalid_regions_and_exclusive_fields_fail_before_upload(self):
        cases = [{"regions": []}, {"regions": REGIONS * 3}, {"pageNumber": False},
                 {"regions": [{"x": 0.9, "y": 0, "width": 0.2, "height": 0.2}]},
                 {"regions": [{"x": 0, "y": 0, "width": float("inf"), "height": 0.2}]},
                 {"regions": [{"x": True, "y": 0, "width": 0.2, "height": 0.2}]},
                 {"regions": [{"x": 0, "y": 0, "width": 0.001, "height": 0.2}]},
                 {"regions": [{**REGIONS[0], "pageId": "other-page"}]},
                 {"imagePath": "page.png"}, {"image": {}}, {"sourcePage": {}}]
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(images.ImageError):
                self.run_import([self.page_item(), self.page_item(**changes)])
        self.client.request.assert_not_called()

    def test_same_page_conflicting_metadata_fails_before_upload(self):
        with self.assertRaises(images.ImageError):
            self.run_import([self.page_item(), self.page_item(fileName="另一个文件.pdf")])
        self.client.request.assert_not_called()

    def test_regions_and_metadata_must_match_readback(self):
        self.run_import()
        expected = self.receipt["results"][0]["sourcePage"]
        for changes in [{"pageId": "other"}, {"regions": list(reversed(REGIONS))},
                        {"fileName": "other.pdf"}, {"pageNumber": 3},
                        {"regions": [{**REGIONS[0], "pageId": "other"}, REGIONS[1]]}]:
            with self.subTest(changes=changes):
                detail = {**self.detail, "sourcePage": {**expected, **changes}}
                result = images.verify_source(self.client, detail, None, expected)
                self.assertFalse(result["verified"])
                self.assertTrue(Path(result["previewPath"]).exists())

    def test_duplicate_checks_attempt_image_and_leaves_source_pending(self):
        self.results[0].update(status="duplicate", practiceRecordId="attempt-1")
        self.detail["records"] = [{"id": "attempt-1", "originalImageUrl": "exists"}]
        with self.assertRaises(images.ImageError):
            self.run_import()
        row = self.receipt["results"][0]
        self.assertFalse(row["sourcePageVerified"])
        self.assertIn("快照未返回", row["checkError"])
        self.assertIn("recordId=attempt-1", self.client.request.call_args.args[0])
        self.assertTrue(Path(row["previewPath"]).exists())

    def test_upload_failure_preserves_pending_without_item_write(self):
        self.client.request.side_effect = images.ImageError("HTTP 429")
        with self.assertRaises(images.ImageError):
            self.run_import()
        self.assertEqual(self.client.request.call_count, 1)
        self.assertEqual(self.receipt["state"], "upload_pending")
        self.assertEqual(self.receipt["pages"][0]["state"], "upload_pending")

    def test_write_failure_preserves_page_and_regions_without_retry(self):
        self.client.request.side_effect = [{"pageId": "page-1"}, images.ImageError("超时")]
        with self.assertRaises(images.ImageError):
            self.run_import()
        self.assertEqual(self.client.request.call_count, 2)
        self.assertEqual(self.receipt["state"], "write_pending")
        self.assertEqual(self.receipt["pages"][0]["pageId"], "page-1")
        self.assertEqual(self.receipt["sources"][0]["regions"], REGIONS)

    def test_missing_page_id_prevents_item_write(self):
        self.client.request.side_effect = [{}]
        with self.assertRaises(images.ImageError):
            self.run_import()
        self.assertEqual(self.client.request.call_count, 1)
        self.assertEqual(self.receipt["state"], "upload_pending")

    def test_partial_failure_keeps_successful_preview(self):
        self.results.append({"index": 1, "error": "AGENT_INVALID_ITEM"})
        with self.assertRaises(images.ImageError):
            self.run_import([self.page_item()] * 2)
        self.assertTrue(self.receipt["results"][0]["verified"])
        self.assertTrue(self.receipt["results"][1]["failed"])
        self.assertEqual(self.receipt["results"][1]["sourcePage"]["regions"], REGIONS)

    def test_missing_image_and_empty_readback_fail(self):
        with self.assertRaises(images.ImageError):
            images.verify_source(self.client, {**self.detail, "originalImageUrl": None}, None,
                                 {"pageId": "page-1", "regions": REGIONS})
        self.client.request.return_value = b""
        self.client.request.side_effect = None
        with self.assertRaises(images.ImageError):
            images.verify_source(self.client, self.detail, None, {"pageId": "page-1", "regions": REGIONS})

    def test_source_verify_cli_is_read_only_and_receipt_is_recoverable(self):
        self.run_import()
        source = self.root / "source.json"
        source.write_text(json.dumps(self.receipt["results"][0]["sourcePage"]))
        self.client.reset_mock()
        receipt_path = self.root / "receipt.json"
        argv = [str(SCRIPT), "verify", "--id", "item-1", "--source-page", str(source), "--receipt", str(receipt_path)]
        environment = {"WRONG_NOTEBOOK_URL": "https://notes.example", "WRONG_NOTEBOOK_TOKEN": "private-token"}
        with patch.object(sys, "argv", argv), patch.dict(os.environ, environment), \
                patch.object(images, "Client", return_value=self.client), patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(images.main(), 0)
        self.assertTrue(all(call.kwargs.get("binary") for call in self.client.request.call_args_list))
        receipt = json.loads(receipt_path.read_text())
        self.assertEqual(receipt["state"], "verified")
        self.assertEqual(receipt["results"][0]["sourcePage"]["pageId"], "page-1")
        self.assertNotIn("private-token", receipt_path.read_text())

    def test_legacy_replace_accepts_expected_source_clear_but_checks_other_fields(self):
        before = {**self.detail, "revision": "a" * 64,
                  "sourcePage": {"pageId": "page-1", "regions": REGIONS}}
        after = {**before, "revision": "b" * 64, "sourcePage": None}
        self.client.detail.side_effect = [before, after]
        self.client.request.side_effect = [{}, PNG]
        args = argparse.Namespace(id="item-1", record_id=None, replace=True, image=self.root / "page.png")
        images.attach_image(self.client, args, self.receipt, lambda: None)
        self.assertTrue(self.receipt["results"][0]["verified"])
        self.assertTrue(self.receipt["results"][0]["otherFieldsUnchanged"])
        self.assertEqual(list(self.client.request.call_args_list[0].args[2]["patch"]), ["image"])
        self.client.detail.side_effect = [before, {**after, "questionText": "意外改题"}]
        self.client.request.side_effect = [{}]
        with self.assertRaises(images.ImageError):
            images.attach_image(self.client, args, self.receipt, lambda: None)

    def test_metadata_is_trimmed_like_server_schema(self):
        self.run_import([self.page_item(fileName=" 试卷.pdf ")])
        self.assertEqual(self.body["items"][0]["sourcePage"]["fileName"], "试卷.pdf")

    def test_import_cli_persists_verified_receipt_without_encoding(self):
        self.manifest.write_text(json.dumps([self.page_item()]))
        receipt_path = self.root / "receipt.json"
        argv = [str(SCRIPT), "import", "--items", str(self.manifest), "--receipt", str(receipt_path)]
        environment = {"WRONG_NOTEBOOK_URL": "https://notes.example", "WRONG_NOTEBOOK_TOKEN": "private-token"}
        with patch.object(sys, "argv", argv), patch.dict(os.environ, environment), \
                patch.object(images, "Client", return_value=self.client), patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(images.main(), 0)
        receipt = json.loads(receipt_path.read_text())
        self.assertEqual(receipt["state"], "verified")
        self.assertEqual(receipt["results"][0]["sourcePage"]["regions"], REGIONS)
        for secret in ("private-token", base64.b64encode(PNG).decode()):
            self.assertNotIn(secret, receipt_path.read_text())
        calls = self.client.request.call_count
        with patch.object(sys, "argv", argv), patch.dict(os.environ, environment), \
                patch.object(images, "Client", return_value=self.client), patch("sys.stderr", new_callable=io.StringIO):
            self.assertEqual(images.main(), 1)
        self.assertEqual(self.client.request.call_count, calls)
        self.assertEqual(json.loads(receipt_path.read_text())["state"], "verified")

    def test_page_file_size_and_format_limits(self):
        path = self.root / "large.png"
        path.write_bytes(PNG + b"x" * (6 * 1024 * 1024))
        self.assertEqual(images.image_file(path, page=True)[0]["mimeType"], "image/png")
        with self.assertRaises(images.ImageError):
            images.image_file(path)
        path.write_bytes(PNG + b"x" * (10 * 1024 * 1024))
        with self.assertRaises(images.ImageError):
            images.image_file(path, page=True)
        path.write_bytes(b"RIFFxxxxWEBPxxxx")
        with self.assertRaises(images.ImageError):
            images.image_file(path, page=True)


if __name__ == "__main__":
    unittest.main()
