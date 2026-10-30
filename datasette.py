# Datasette inside the app (datasette.go): run by the WebAssembly Python
# (scripts/build_python.sh) under wazero, seeing only its own files and the one
# database up, read-only. There's no web server here and no socket (WASI has
# neither): the host sends each request as a line of JSON on stdin, and this
# answers it with Datasette's own app (ASGI), one line back on stdout, marked so
# a stray print can't be taken for it. One at a time, and no threads: SQL runs
# here (num_sql_threads 0), time-limited by SQLite's progress handler.
#
#   python -c <this> <database> <title> <base url>
import asyncio, base64, json, os, selectors, sys, time

os.geteuid = getattr(os, "geteuid", lambda: 0)  # platformdirs asks; WASI has no users
MARK = b"\x00MP "

db, title, base = sys.argv[1:4]
from datasette.app import Datasette

ds = Datasette(
    immutables=[db],  # opened immutable: SQLite reads it and never writes, locks or journals
    settings={
        "base_url": base,
        "num_sql_threads": 0,
        "sql_time_limit_ms": 3000,
        "max_returned_rows": 1000,
        "allow_download": False,  # the file itself stays on the Mac
        "allow_csv_stream": False,
        "default_cache_ttl": 0,
    },
    metadata={"title": title},
)
app = ds.app()


class NoSockets(selectors.BaseSelector):
    # asyncio's loop with nothing to wait on but its timers: WASI has no sockets
    def __init__(self):
        self._map = {}

    def register(self, f, events, data=None):
        raise OSError("no sockets here")

    def unregister(self, f):
        raise KeyError(f)

    def select(self, timeout=None):
        if timeout:
            time.sleep(timeout)
        return []

    def get_map(self):
        return self._map


class Loop(asyncio.SelectorEventLoop):
    def _make_self_pipe(self):
        self._ssock = self._csock = None

    def _close_self_pipe(self):
        pass

    def _write_to_self(self):
        pass

    def run_in_executor(self, executor, func, *args):
        # no threads here: what would go to one (aiofiles, for Datasette's own CSS and JS) is done at once
        fut = self.create_future()
        try:
            fut.set_result(func(*args))
        except BaseException as e:
            fut.set_exception(e)
        return fut


async def answer(req):
    out = {"status": 500, "headers": [], "body": b""}
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": req["method"],
        "scheme": "http",
        "path": req["path"],
        "raw_path": req["path"].encode(),
        "query_string": req["query"].encode(),
        "root_path": "",
        "headers": [(k.lower().encode(), v.encode()) for k, v in req.get("headers") or []],
        "client": ("127.0.0.1", 0),
        "server": ("localhost", 80),
    }

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(m):
        if m["type"] == "http.response.start":
            out["status"] = m["status"]
            out["headers"] = [[k.decode("latin-1"), v.decode("latin-1")] for k, v in m.get("headers", [])]
        elif m["type"] == "http.response.body":
            out["body"] += m.get("body", b"")

    await app(scope, receive, send)
    return out


def reply(msg):
    sys.stdout.buffer.write(MARK + json.dumps(msg).encode() + b"\n")
    sys.stdout.buffer.flush()


async def main():
    await ds.invoke_startup()
    reply({"ready": True})
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return
        try:
            res = await answer(json.loads(line))
            res["body"] = base64.b64encode(res["body"]).decode()
        except Exception as e:  # a request that broke: said, and on to the next
            res = {"status": 500, "headers": [["content-type", "text/plain"]], "body": base64.b64encode(repr(e).encode()).decode()}
        reply(res)


loop = Loop(NoSockets())
asyncio.set_event_loop(loop)
loop.run_until_complete(main())
