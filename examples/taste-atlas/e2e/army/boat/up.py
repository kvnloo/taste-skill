#!/usr/bin/env python3
"""Tester army for /mission on Boat: one owned sandbox per `e2e explore` lane, at phone and desktop sizes.

reuse-checked: glide frontend/e2e/army/boat/up.py -- its Boat lifecycle (Army: create/upload/pull/delete + usage
receipts, plan-only budget guard) is imported, not copied; only the glide-specific bundle/G0/tern steps differ.
Snapshot: glide's ready glide-army-* snapshot, whose /home/user/army/node_modules came from the same package-lock.json.
site/ = taste-atlas at SITE_SHA (default origin/exp/atlas-mission). canary/ = CANARY_SHA (default e53431c, the build
before the phone fix: header 1260 px wide at 390 px, Retro/theme/mode controls off screen, 27 px taps). The canary lane
must report that breakage, or a clean verdict on site/ means nothing.
Run from e2e/army: with-keys.sh python3 boat/up.py   (env: LANES=1..3, STEPS, GOALS=id,id, DET=0, SNAPSHOT)
"""
import importlib.util, io, json, os, re, subprocess, sys, tarfile, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
GLIDE = Path(os.getenv('GLIDE_ARMY', '/mnt/zer0models/worktrees/glide-main/frontend/e2e/army'))
sys.path.insert(0, str(GLIDE))  # glide up.py imports its canary/findings siblings
_spec = importlib.util.spec_from_file_location('glide_army_up', GLIDE / 'boat/up.py')
glide = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(glide)
Army, boat, run, redact, digest = glide.Army, glide.boat, glide.run, glide.redact, glide.digest


def guard_budget(billing, starts):  # Boat now returns walletStatus: null (no wallet = $0); glide's guard expects a dict
    glide.guard_budget(dict(billing, walletStatus=billing.get('walletStatus') or {}), starts)

# The canary's known breakage; a canary lane catches it when a finding names one of these.
CANARY_SIGNS = ('off screen', 'off-screen', 'offscreen', 'cut off', 'clipped', 'not visible', 'outside the viewport',
                'overflow', 'horizontal scroll', 'scroll horizontally', 'sideways', 'too small', "can't find", 'cannot find',
                'could not find', 'unreachable', 'not reachable', 'cannot tap', 'could not tap', 'unable to tap', 'hidden')


def site(dest, sha):
    blob = subprocess.run(['git', '-C', str(REPO), 'archive', sha, 'examples/taste-atlas'], capture_output=True, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(blob)) as tar:
        tar.extractall(dest.parent / ('x-' + dest.name), filter='data')
    (dest.parent / ('x-' + dest.name) / 'examples/taste-atlas').rename(dest)
    assert not (dest / 'data').exists(), 'private data/ must never ship'


def goals():
    wanted = set(filter(None, os.getenv('GOALS', '').split(',')))
    rows = [dict(zip(('id', 'target', 'goal'), line.split('\t', 2)))
            for line in (ROOT / 'goals.tsv').read_text().splitlines() if line.strip()]
    return [r for r in rows if not wanted or r['id'] in wanted]


def walk(v):
    if isinstance(v, dict):
        yield v
        for c in v.values():
            yield from walk(c)
    elif isinstance(v, list):
        for c in v:
            yield from walk(c)


def findings(out, lanes):
    """Every reported finding per lane, plus canary recall. A lane with no report is a provider gap, not a pass."""
    rows, reported = [], set()
    for rep in sorted(out.glob('*/runs/**/*.json')):
        lane = rep.relative_to(out).parts[0]
        try:
            data = json.loads(rep.read_text())
        except Exception:
            continue
        for f in walk(data):
            if f.get('title') and any(k in f for k in ('actual', 'description', 'expected', 'severity', 'repro_steps')):
                reported.add(lane)
                rows.append(dict(lane=lane, severity=str(f.get('severity', f.get('type', '?'))), title=f['title'],
                                 detail=str(f.get('actual') or f.get('description') or '')[:400]))
        if any(k in json.dumps(data)[:20000] for k in ('"summary"', '"verdict"')):
            reported.add(lane)
    rows = list({(r['lane'], r['title']): r for r in rows}.values())
    caught = {}
    for r in rows:
        if r['lane'].startswith('canary') and any(s in (r['title'] + ' ' + r['detail']).lower() for s in CANARY_SIGNS):
            caught.setdefault(r['lane'], []).append(r['title'])
    canaries = [l['id'] for l in lanes if l['id'].startswith('canary')]
    # same rule as glide findings.py: a cut-short or provider-failed explore is a coverage gap, never a clean pass
    gap = re.compile(r'cut short|STEP_TIMEOUT|model provider failed|AUTOMATION_UNSUPPORTED|ended: aborted|PROVIDER_ERROR|INVALID_CONFIG', re.I)
    gaps = [l['id'] for l in lanes if (lambda f: not f.exists() or gap.search(f.read_text(errors='replace')))(out / l['id'] / 'runs' / (l['id'] + '.log'))]
    smoke = {l['id']: (out / l['id'] / 'runs/smoke.exit').read_text().strip() for l in lanes if (out / l['id'] / 'runs/smoke.exit').exists()}
    summary = dict(findings=rows, coverage_gaps=gaps, smoke_exit=smoke, reported=sorted(reported), no_report=[l['id'] for l in lanes if l['id'] not in reported],
                   canary_caught=caught, canary_ok=all(c in caught for c in canaries))
    (out / 'findings.json').write_text(json.dumps(summary, indent=2))
    for r in rows:
        print(f"[{r['lane']}] {r['severity']}: {r['title']} :: {r['detail'][:200]}")
    print('coverage gaps:', gaps, '| smoke exit:', smoke, '| no report:', summary['no_report'], '| canary caught:', json.dumps(caught))
    return summary


def main():
    os.chdir(ROOT)
    os.environ['BOAT_NO_UPDATE'] = '1'
    if not os.getenv('NVIDIA_API_KEY'):
        raise RuntimeError('run via the ops with-keys.sh; NVIDIA_API_KEY is missing')
    selected, width = goals(), int(os.getenv('LANES', '3'))
    if not 1 <= width <= 3:
        raise ValueError('LANES must be 1..3 to respect NIM throughput')
    out = Path(os.getenv('OUT', 'runs/boat/' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))).resolve()
    out.mkdir(parents=True, exist_ok=False)
    army, before = Army(out), boat('billing')
    (out / 'billing-before.json').write_text(json.dumps(before, indent=2))
    guard_budget(before, min(len(selected), width))
    sha = run('git', '-C', str(REPO), 'rev-parse', os.getenv('SITE_SHA', 'origin/exp/atlas-mission')).strip()
    canary = run('git', '-C', str(REPO), 'rev-parse', os.getenv('CANARY_SHA', 'e53431c')).strip()
    snaps = [s['name'] for s in boat('snapshots')['named'] if s['name'].startswith('glide-army-') and s.get('status') == 'ready']
    snap = os.getenv('SNAPSHOT') or (snaps[-1] if snaps else '')
    if not snap:
        raise RuntimeError('no ready glide-army-* snapshot to reuse; build one with the glide army first')
    army.meta.update(sha=sha, canary_sha=canary, snapshot=snap, steps=int(os.getenv('STEPS', '14')))
    army.save()
    failures, summary = [], {'canary_ok': False}
    try:
        with tempfile.TemporaryDirectory(prefix='mission-army-') as temp:
            pack = Path(temp) / 'army'
            pack.mkdir()
            for name in ('package.json', 'package-lock.json', 'agent.ts', 'browser.ts', 'army.config.ts', 'goals.tsv', 'boat', 'tests'):
                run('cp', '-r', str(ROOT / name), str(pack / name))
            site(pack / 'site', sha)
            site(pack / 'canary', canary)
            archive = Path(temp) / 'bundle.tgz'
            with tarfile.open(archive, 'w:gz', compresslevel=1) as tar:
                tar.add(pack, arcname='army', filter=lambda t: None if '/x-' in t.name else t)
            army.meta['payload_sha256'] = digest(archive)
            pending, active, first = selected[:], {}, True
            while pending or active:
                while pending and len(active) < width:
                    guard_budget(boat('billing'), 1)
                    lane = dict(pending.pop(0), steps=army.meta['steps'], det=int(first and os.getenv('DET', '1') == '1'))
                    first = False
                    sid = army.new('mission-army-' + lane['id'], snap, keyed=True)
                    army.upload(sid, archive, include_glide=True)  # extracts over /home/user/army; snapshot node_modules stay
                    config = Path(temp) / 'lane-config.json'
                    config.write_text(json.dumps(lane))
                    run('boat', '--no-update', 'scp', str(config), f'{sid}:/home/user/army/lane-config.json')
                    boat('exec', sid, '--detach', '--cwd', 'army', '--', 'bash', 'boat/lane.sh')
                    active[sid] = (lane, time.monotonic())
                    army.meta['lanes'].append(dict(lane, sandbox=sid, goal='<goals.tsv>'))
                    army.save()
                time.sleep(20)
                for sid, (lane, start) in list(active.items()):
                    done = army.remote(sid, 'if test -f runs/done; then cat runs/explore.exit; fi', 30).strip()
                    expired = time.monotonic() - start > int(os.getenv('LANE_TIMEOUT', '1300'))
                    if done or expired:
                        army.pull(sid, out / lane['id'])
                        army.delete(sid)
                        del active[sid]
                        if done != '0' or expired:
                            failures.append(lane['id'])
            army.meta['failed_lanes'] = failures
    except Exception as error:
        army.meta['error'] = redact(str(error))
        army.save()
        raise
    finally:
        army.cleanup()
        after, current = boat('billing'), boat('list')
        (out / 'billing-after.json').write_text(json.dumps(after, indent=2))
        alive = {item['id'] for item in current['sandboxes']}
        army.meta['deletion_verified'] = all(item['id'] not in alive for item in army.meta['sandboxes'])
        army.meta['account_vm_minutes_delta'] = (after['limits']['creditUsedSeconds'] - before['limits']['creditUsedSeconds']) / 60
        army.meta['finished_at'] = time.time()
        army.save()
        summary = findings(out, army.meta['lanes'])
        print('Artifacts: ' + str(out), flush=True)
    return 1 if failures or summary.get('coverage_gaps') or not army.meta['deletion_verified'] or not summary['canary_ok'] else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print('ARMY BLOCKED: ' + redact(str(error)), file=sys.stderr)
        sys.exit(1)
