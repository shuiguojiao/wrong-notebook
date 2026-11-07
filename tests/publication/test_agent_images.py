"""用隔离 HTTP 服务检查图片脚本，不访问真实题库或读取真实凭据。"""

import base64
import copy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
from urllib.parse import parse_qs, urlsplit

SCRIPT = Path(__file__).resolve().parents[2] / "packaging/agent-skill/wrong-notebook-import/scripts/images.py"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")


class ImageScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image = self.root / "question.png"
        self.image.write_bytes(PNG)
        self.receipt = self.root / "receipt.json"
        self.requests = []
        self.status = 200
        self.drop_write = False
        self.corrupt_image = False
        self.change_text = False
        self.paginate = False
        self.revision_conflict = False
        self.item = {"id": "item-1", "revision": "a" * 64, "questionText": "求 $a_{2026}$。",
                     "answerText": "$1$", "originalImageUrl": None,
                     "records": [], "recordTotal": 0, "nextOffset": None, "updatedAt": "before"}
        self.results = [{"index": 0, "id": "item-1", "shortId": "short", "status": "created", "link": "https://notes.example/error-items/item-1"}]
        self.bytes = {}
        state = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def handle_request(self):
                parsed = urlsplit(self.path)
                query = parse_qs(parsed.query)
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"]))) if self.headers.get("Content-Length") else None
                state.requests.append((self.command, parsed.path, query, body, self.headers.get("Authorization")))
                if state.status != 200:
                    self.send_response(state.status)
                    self.send_header("Retry-After", "7")
                    self.send_header("Location", state.url + "/unexpected")
                    self.end_headers()
                    self.wfile.write(b"private-error-response")
                    return
                if self.command in ("POST", "PATCH"):
                    if self.command == "POST":
                        for row in state.results:
                            if "error" in row:
                                continue
                            entry = body["items"][row["index"]]
                            record_id = row.get("practiceRecordId", "")
                            state.bytes[record_id] = base64.b64decode(entry["image"]["base64"])
                            if record_id:
                                state.item["records"] = [{"id": record_id, "originalImageUrl": "https://untrusted.invalid/image", "editable": True}]
                                state.item["recordTotal"] = 1
                            else:
                                state.item["originalImageUrl"] = "https://untrusted.invalid/image"
                        response = {"results": state.results}
                    else:
                        if state.revision_conflict or body["expectedRevision"] != state.item["revision"]:
                            self.send_response(409)
                            self.end_headers()
                            return
                        record_id = body.get("recordId", "")
                        state.bytes[record_id] = base64.b64decode(body["patch"]["image"]["base64"])
                        if record_id:
                            next(row for row in state.item["records"] if row["id"] == record_id)["originalImageUrl"] = "https://untrusted.invalid/image"
                        else:
                            state.item["originalImageUrl"] = "https://untrusted.invalid/image"
                        state.item["revision"] = "b" * 64
                        state.item["updatedAt"] = "after"
                        if state.change_text:
                            state.item["questionText"] = "意外改题"
                        response = {"item": state.item}
                    if state.drop_write:
                        self.connection.shutdown(socket.SHUT_RDWR)
                        self.connection.close()
                        return
                elif parsed.path.endswith("/detail"):
                    response = {"item": copy.deepcopy(state.item)}
                    if state.paginate:
                        offset = int(query["offset"][0])
                        response["item"]["records"] = state.item["records"][offset:offset + 50]
                        response["item"]["nextOffset"] = offset + 50 if offset + 50 < len(state.item["records"]) else None
                elif parsed.path.endswith("/image"):
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b"wrong-bytes" if state.corrupt_image else state.bytes[query.get("recordId", [""])[0]])
                    return
                else:
                    self.send_response(404)
                    self.end_headers()
                    return
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps(response).encode())

            do_GET = do_POST = do_PATCH = handle_request

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = "http://127.0.0.1:%d" % self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.env = {**os.environ, "WRONG_NOTEBOOK_URL": self.url, "WRONG_NOTEBOOK_TOKEN": "test-private-token", "PYTHONDONTWRITEBYTECODE": "1"}

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def run_script(self, *args):
        result = subprocess.run([sys.executable, str(SCRIPT), *args, "--receipt", str(self.receipt)],
                                env=self.env, capture_output=True, text=True, timeout=15)
        for secret in ("test-private-token", "private-error-response", base64.b64encode(PNG).decode()):
            self.assertNotIn(secret, result.stdout + result.stderr)
            if self.receipt.exists():
                self.assertNotIn(secret, self.receipt.read_text())
        return result

    def import_one(self):
        manifest = self.root / "items.json"
        manifest.write_text(json.dumps([{"notebookId": "notebook", "questionText": self.item["questionText"], "imagePath": self.image.name}]))
        return self.run_script("import", "--items", str(manifest))

    def read_receipt(self):
        return json.loads(self.receipt.read_text())

    def test_import_uploads_bytes_and_checks_readback_on_configured_site(self):
        self.assertEqual(self.import_one().returncode, 0)
        receipt = self.read_receipt()
        self.assertEqual(receipt["state"], "verified")
        self.assertEqual(receipt["results"][0]["link"], self.results[0]["link"])
        self.assertEqual(receipt["results"][0]["sha256"], hashlib.sha256(PNG).hexdigest())
        self.assertEqual([row[0] for row in self.requests], ["POST", "GET", "GET"])
        self.assertTrue(all(row[4] == "Bearer test-private-token" for row in self.requests))
        self.assertEqual(self.requests[0][3]["items"][0]["questionText"], self.item["questionText"])

    def test_duplicate_verifies_attempt_image_instead_of_original(self):
        self.results[0].update(status="duplicate", practiceRecordId="attempt-1")
        self.assertEqual(self.import_one().returncode, 0)
        self.assertEqual(self.requests[-1][2]["recordId"], ["attempt-1"])
        self.assertIsNone(self.item["originalImageUrl"])

    def test_missing_duplicate_record_id_does_not_verify_original(self):
        self.results[0]["status"] = "duplicate"
        self.assertEqual(self.import_one().returncode, 1)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(self.read_receipt()["results"][0]["id"], "item-1")

    def test_partial_failure_keeps_success_receipt_and_returns_failure(self):
        manifest = self.root / "items.json"
        manifest.write_text(json.dumps([{"notebookId": "n", "questionText": "q", "imagePath": self.image.name}] * 2))
        self.results.append({"index": 1, "error": "private-error-response"})
        self.assertEqual(self.run_script("import", "--items", str(manifest)).returncode, 1)
        rows = self.read_receipt()["results"]
        self.assertTrue(rows[0]["verified"])
        self.assertTrue(rows[1]["failed"])

    def test_hash_mismatch_preserves_ids_without_retry(self):
        self.corrupt_image = True
        self.assertEqual(self.import_one().returncode, 1)
        self.assertEqual(self.read_receipt()["state"], "readback_pending")
        self.assertEqual(self.read_receipt()["results"][0]["id"], "item-1")
        self.assertEqual(sum(row[0] == "POST" for row in self.requests), 1)

    def test_write_disconnect_keeps_pending_and_can_be_verified_read_only(self):
        self.drop_write = True
        self.assertEqual(self.import_one().returncode, 1)
        self.assertEqual(self.read_receipt()["state"], "write_pending")
        self.receipt = self.root / "verification.json"
        self.assertEqual(self.run_script("verify", "--id", "item-1", "--image", str(self.image)).returncode, 0)
        self.assertEqual(sum(row[0] == "POST" for row in self.requests), 1)

    def test_attach_uses_revision_and_only_patches_image(self):
        self.assertEqual(self.run_script("attach", "--id", "item-1", "--image", str(self.image)).returncode, 0)
        patch = next(row for row in self.requests if row[0] == "PATCH")
        self.assertEqual(list(patch[3]["patch"]), ["image"])
        self.assertEqual(patch[3]["expectedRevision"], "a" * 64)
        self.assertTrue(self.read_receipt()["results"][0]["otherFieldsUnchanged"])

    def test_attach_record_preserves_original(self):
        self.item.update(records=[{"id": "attempt-1", "originalImageUrl": None, "editable": True}], recordTotal=1)
        self.assertEqual(self.run_script("attach", "--id", "item-1", "--record-id", "attempt-1", "--image", str(self.image)).returncode, 0)
        patch = next(row for row in self.requests if row[0] == "PATCH")
        self.assertTrue(patch[1].endswith("/records/update"))
        self.assertIsNone(self.item["originalImageUrl"])

    def test_attach_detects_unexpected_text_changes(self):
        self.change_text = True
        self.assertEqual(self.run_script("attach", "--id", "item-1", "--image", str(self.image)).returncode, 1)
        self.assertNotEqual(self.read_receipt()["state"], "verified")

    def test_existing_image_requires_explicit_replacement(self):
        self.item["originalImageUrl"] = "existing"
        self.assertEqual(self.run_script("attach", "--id", "item-1", "--image", str(self.image)).returncode, 1)
        self.assertFalse(any(row[0] == "PATCH" for row in self.requests))
        self.receipt = self.root / "replacement.json"
        self.assertEqual(self.run_script("attach", "--replace", "--id", "item-1", "--image", str(self.image)).returncode, 0)

    def test_redirect_auth_rate_limit_and_conflict_never_retry(self):
        for status in (302, 401, 409, 429):
            with self.subTest(status=status):
                self.status = status
                self.requests.clear()
                self.receipt = self.root / ("receipt-%d.json" % status)
                result = self.import_one()
                self.assertEqual(result.returncode, 1)
                self.assertIn("HTTP %d" % status, result.stderr)
                self.assertEqual(len(self.requests), 1)

    def test_existing_receipt_and_invalid_image_prevent_write(self):
        self.receipt.write_text("old receipt")
        self.assertEqual(self.import_one().returncode, 1)
        self.assertEqual(self.receipt.read_text(), "old receipt")
        self.assertEqual(self.requests, [])
        self.receipt = self.root / "new.json"
        self.image.write_text("invalid image")
        self.assertEqual(self.import_one().returncode, 1)
        self.assertEqual(self.requests, [])

    def test_attach_conflict_stops_without_retry(self):
        self.revision_conflict = True
        result = self.run_script("attach", "--id", "item-1", "--image", str(self.image))
        self.assertEqual(result.returncode, 1)
        self.assertIn("HTTP 409", result.stderr)
        self.assertEqual([row[0] for row in self.requests], ["GET", "PATCH"])
        self.assertIsNone(self.item["originalImageUrl"])

    def test_attach_finds_older_record_through_pagination(self):
        self.paginate = True
        records = [{"id": "attempt-%d" % index, "originalImageUrl": None, "editable": True} for index in range(51)]
        self.item.update(records=records, recordTotal=len(records))
        result = self.run_script("attach", "--id", "item-1", "--record-id", "attempt-50", "--image", str(self.image))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.requests[-1][2]["recordId"], ["attempt-50"])
        self.assertIsNone(self.item["records"][0]["originalImageUrl"])

    @unittest.skipIf(sys.version_info < (3, 11), "读取 TOML 需 Python 3.11+")
    def test_config_reads_existing_mcp_without_using_environment_token(self):
        config = self.root / "config.toml"
        config.write_text('[mcp_servers.wrong-notebook]\nurl = "%s/api/mcp"\n[mcp_servers.wrong-notebook.http_headers]\nAuthorization = "Bearer test-private-token"\n' % self.url)
        self.env["WRONG_NOTEBOOK_TOKEN"] = "wrong-environment-token"
        self.bytes[""] = PNG
        self.item["originalImageUrl"] = "exists"
        result = self.run_script("--config", str(config), "verify", "--id", "item-1", "--image", str(self.image))
        self.assertEqual(result.returncode, 0)
        self.assertTrue(all(row[4] == "Bearer test-private-token" for row in self.requests))


if __name__ == "__main__":
    unittest.main()
