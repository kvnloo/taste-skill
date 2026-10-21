#!/usr/bin/env python3
"""Read-only export of your own X bookmarks via twitter-cli's existing logged-in cookies.
No credential output, no writes to X. Pages are checkpointed so a run can resume.
Write the output into your PRIVATE taste data repo, never into this public fork.
Run with twitter-cli's pipx Python. Default budget 100 pages, 3 s between pages.
"""
import argparse
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from twitter_cli.cli import _get_client
from twitter_cli.client import FEATURES, _deep_get, parse_timeline_response
from twitter_cli.serialization import tweets_to_json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--max-pages', type=int, default=100)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    checkpoint = args.out / 'checkpoint.json'
    if checkpoint.exists():
        state = json.loads(checkpoint.read_text())
        if state['stop_reason'] not in ('running', 'page_budget', 'error'):
            print(json.dumps({k:v for k,v in state.items() if k != 'cursor'}))
            return
    else:
        state = {'started_at': datetime.now(timezone.utc).isoformat(), 'cursor': None,
                 'pages': 0, 'count': 0, 'stop_reason': 'running', 'empty_pages': 0}
    path = args.out / 'bookmarks.json'
    rows = json.loads(path.read_text()) if path.exists() else []
    seen = {r['id'] for r in rows}
    client = _get_client({'rateLimit': {'requestDelay':3, 'maxRetries':0}}, quiet=True)
    def instructions(data):
        return (_deep_get(data,'data','bookmark_timeline','timeline','instructions')
                or _deep_get(data,'data','bookmark_timeline_v2','timeline','instructions'))
    try:
        for _ in range(args.max_pages):
            variables = {'count':40, 'includePromotedContent':False,
                         'latestControlAvailable':True, 'requestContext':'launch'}
            if state['cursor']:
                variables['cursor'] = state['cursor']
            data = client._graphql_get('Bookmarks', variables, FEATURES)
            if data.get('errors'):
                raise RuntimeError('GraphQL errors; export stopped without retries')
            ins = instructions(data)
            if ins is None:
                raise RuntimeError('Missing timeline instructions; not treated as exhaustion')
            tweets, next_cursor = parse_timeline_response(data, instructions)
            page_rows = json.loads(tweets_to_json(tweets))
            state['pages'] += 1
            (args.out / ('page-%03d.json' % state['pages'])).write_text(json.dumps(page_rows,ensure_ascii=False,indent=2)+'\n')
            new = [r for r in page_rows if r['id'] not in seen]
            for r in new:
                rows.append(r); seen.add(r['id'])
            state['empty_pages'] = state['empty_pages']+1 if not new else 0
            state['count'] = len(rows)
            state['last_page_count'] = len(page_rows)
            state['has_cursor'] = bool(next_cursor)
            if not next_cursor:
                state['stop_reason'] = 'no_next_cursor'
            elif next_cursor == state['cursor']:
                state['stop_reason'] = 'repeated_cursor'
            elif state['empty_pages'] >= 3:
                state['stop_reason'] = 'three_pages_without_new_ids'
            else:
                state['stop_reason'] = 'running'
            state['cursor'] = next_cursor
            state['updated_at'] = datetime.now(timezone.utc).isoformat()
            path.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
            checkpoint.write_text(json.dumps(state,indent=2)+'\n')
            print(json.dumps({'page':state['pages'],'new':len(new),'total':len(rows),'stop':state['stop_reason']}), flush=True)
            if state['stop_reason'] != 'running':
                break
            time.sleep(3)
        else:
            state['stop_reason'] = 'page_budget'
    except Exception as exc:
        state['stop_reason'] = 'error'
        state['error_class'] = type(exc).__name__
        print('Stopped: '+type(exc).__name__, flush=True)
    checkpoint.write_text(json.dumps(state,indent=2)+'\n')
    receipt = {k:v for k,v in state.items() if k != 'cursor'}
    receipt['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
    receipt['scope'] = 'Endpoint-visible bookmarks; cursor exhaustion is not an independent account-wide total.'
    (args.out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))
    if state['stop_reason']=='error':
        raise SystemExit(1)

if __name__ == '__main__':
    main()
