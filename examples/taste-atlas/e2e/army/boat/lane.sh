#!/usr/bin/env bash
# Runs only inside an owned Boat sandbox (never on groot): serve the app + canary, optional deterministic suite, one explore goal.
set -uo pipefail
cd /home/user/army && mkdir -p runs
cfg() { node -e "process.stdout.write(String(require('./lane-config.json')['$1'] ?? ''))"; }
id=$(cfg id); target=$(cfg target); steps=$(cfg steps); det=$(cfg det)
for p in 18941:site 18942:canary; do mkdir -p /tmp/home-${p%%:*}; (cd ${p#*:} && TASTE_BOARD_PORT=${p%%:*} TASTE_BOARD_HOME=/tmp/home-${p%%:*} exec node scripts/board.mjs serve) > runs/server-${p%%:*}.log 2>&1 & done
for i in $(seq 30); do curl -sf -o /dev/null http://127.0.0.1:18941/mission && curl -sf -o /dev/null http://127.0.0.1:18942/mission && break; sleep 1; done
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18941/mission > runs/ready.txt
if [ "$det" = 1 ]; then
  (cd site && CHROME=/usr/bin/google-chrome PW_FROM=/home/user/army/package.json MISSION=1 BASE=http://127.0.0.1:18941 timeout 400 node scripts/shot.mjs /home/user/army/runs/det) > runs/det.log 2>&1; echo $? > runs/det.exit
fi
export E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 CHROME_EXE=/usr/bin/google-chrome TMPDIR=/tmp DISPLAY=:0; unset WAYLAND_DISPLAY
# deterministic gate on this lane's target first (the canary must fail it), then the vision-model explorer
timeout 300 node_modules/.bin/e2e run --config army.config.ts --target "$target" --reporter list > runs/smoke.log 2>&1 < /dev/null; echo $? > runs/smoke.exit
timeout 1000 node_modules/.bin/e2e explore "$(cfg goal)" --config army.config.ts --target "$target" --max-steps "$steps" --timeout 900000 --output "runs/$id" --reporter list > "runs/$id.log" 2>&1 < /dev/null
echo $? > runs/explore.exit; touch runs/done
