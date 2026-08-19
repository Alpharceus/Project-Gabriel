"""Zero-logic CLI wrapper around gabriel.core / gabriel.store."""

import argparse
import logging

from . import config, core, store


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="gabriel", description="Device group chat over Firebase")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_send = sub.add_parser("send", help="send a message to the group")
    p_send.add_argument("body", nargs="+", help="message text (or a URL with --kind url)")
    p_send.add_argument("--kind", choices=["text", "url"], default="text")

    p_log = sub.add_parser("log", help="show the chat view")
    p_log.add_argument("-n", type=int, default=20, help="how many messages (default 20)")

    p_recv = sub.add_parser("recv", help="run the receiver loop (foreground)")
    p_recv.add_argument("--logfile", default=None, help="log to this file instead of stderr")

    sub.add_parser("keygen", help="generate a new E2E key for the config files")

    args = p.parse_args(argv)

    if args.cmd == "keygen":
        from . import crypto
        print(crypto.generate_key())
        return

    if args.cmd == "send":
        print(core.send(" ".join(args.body), kind=args.kind))
    elif args.cmd == "log":
        for ts, src, kind, body, direction in store.recent(config.load().db, args.n):
            print(f"{ts}  {src:>8}  {body}")
    elif args.cmd == "recv":
        logging.basicConfig(
            filename=args.logfile,
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(message)s",
        )
        core.receive_loop()
